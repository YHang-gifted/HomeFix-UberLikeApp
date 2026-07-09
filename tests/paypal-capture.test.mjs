import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPayments,
  resetPaymentProviderForTests,
  resetPaypalCapturerForTests,
  setPaymentProviderForTests,
  setPaypalCapturerForTests,
} from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// slice 155: an approved PayPal order is captured (charging the buyer) and only then is
// the payment settled. The mock /pay is also blocked for a PayPal payment.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

// A fake external PayPal provider (no network): opens a fixed order id.
const fakePaypalProvider = {
  id: 'paypal',
  usesExternalCheckout: true,
  createCharge: () =>
    Promise.resolve({
      providerRef: 'ORDER-1',
      checkoutUrl: 'https://www.paypal.com/checkoutnow?token=ORDER-1',
    }),
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PayPal capture settlement', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetPaymentProviderForTests();
    resetPaypalCapturerForTests();
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await resetServiceRequests();
    await resetPayments();
    await resetQuotes();
    await resetPayouts();
    resetPaymentProviderForTests();
    resetPaypalCapturerForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Create a request, assign, quote, accept, and set up a payment; return its id. */
  async function setupPayment() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/quote`, {
      amountCents: AMOUNT,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
      amountCents: AMOUNT,
    });
    return request.id;
  }

  function capture(requestId, id = CUSTOMER_ID, role = 'customer') {
    return api(id, role, 'POST', `/service-requests/${requestId}/payment/paypal/capture`);
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('captures the approved order, settles the payment, and schedules a payout', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    let capturedOrder;
    setPaypalCapturerForTests((orderId) => {
      capturedOrder = orderId;
      return Promise.resolve({ status: 'COMPLETED', paymentId: null });
    });

    const requestId = await setupPayment();
    const res = await capture(requestId);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'paid');
    // Captured by the order id we stored when the charge was opened.
    assert.equal(capturedOrder, 'ORDER-1');

    // The worker's net is scheduled for payout.
    const payouts = await (await api(WORKER_ID, 'worker', 'GET', '/payouts')).json();
    assert.equal(payouts.items.length, 1);

    // Idempotent: a repeated capture returns the already-paid payment.
    const again = await capture(requestId);
    assert.equal(again.status, 200);
    assert.equal((await again.json()).status, 'paid');
  });

  it('forbids a non-owner from capturing (403)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    setPaypalCapturerForTests(() => Promise.resolve({ status: 'COMPLETED', paymentId: null }));

    const requestId = await setupPayment();
    assert.equal((await capture(requestId, WORKER_ID, 'worker')).status, 403);
  });

  it('rejects capturing a payment that is not a PayPal payment (409)', async () => {
    // No provider override → the payment is taken by the mock provider.
    const requestId = await setupPayment();
    assert.equal((await capture(requestId)).status, 409);
  });

  it('does not settle when PayPal does not complete the capture (402)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    setPaypalCapturerForTests(() => Promise.resolve({ status: 'PENDING', paymentId: null }));

    const requestId = await setupPayment();
    assert.equal((await capture(requestId)).status, 402);
    assert.equal(await paymentStatus(requestId), 'pending');
  });

  it('blocks the mock /pay for a PayPal payment even when the mock is active (409)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const requestId = await setupPayment();
    // Revert the active provider to the mock; the per-payment guard must still block it.
    resetPaymentProviderForTests();

    const res = await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${requestId}/payment/pay`,
    );
    assert.equal(res.status, 409);
    assert.equal(await paymentStatus(requestId), 'pending');
  });
});
