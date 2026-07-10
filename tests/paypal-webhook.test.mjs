import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { AppError } from '../server/src/errors/appError.ts';
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
import {
  resetPaypalWebhookVerifierForTests,
  setPaypalWebhookVerifierForTests,
} from '../server/src/services/paypalWebhookService.ts';

// slice 158: the /webhooks/paypal backup — a completed capture settles the payment, and an
// approved order is captured server-side (the buyer approved but never returned).

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

const fakePaypalProvider = {
  id: 'paypal',
  usesExternalCheckout: true,
  createCharge: () => Promise.resolve({ providerRef: 'ORDER-1', checkoutUrl: 'https://pp/O1' }),
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PayPal webhook backup', () => {
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
    resetPaypalWebhookVerifierForTests();
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
    resetPaypalWebhookVerifierForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Set up a PayPal payment; return { requestId, payment }. */
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
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
        amountCents: AMOUNT,
      })
    ).json();
    return { requestId: request.id, payment };
  }

  function postWebhook() {
    return fetch(`${baseUrl}/webhooks/paypal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'x' }),
    });
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('settles the payment on a completed-capture event (by custom_id)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const { requestId, payment } = await setupPayment();
    setPaypalWebhookVerifierForTests(() =>
      Promise.resolve({ type: 'PAYMENT.CAPTURE.COMPLETED', paymentId: payment.id, orderId: null }),
    );

    assert.equal((await postWebhook()).status, 200);
    assert.equal(await paymentStatus(requestId), 'paid');
  });

  it('captures and settles an approved order (interrupted-return backup)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const { requestId, payment } = await setupPayment();
    let capturedOrder;
    setPaypalCapturerForTests((orderId) => {
      capturedOrder = orderId;
      return Promise.resolve({ status: 'COMPLETED', paymentId: payment.id });
    });
    setPaypalWebhookVerifierForTests(() =>
      Promise.resolve({ type: 'CHECKOUT.ORDER.APPROVED', paymentId: null, orderId: 'ORDER-1' }),
    );

    assert.equal((await postWebhook()).status, 200);
    assert.equal(capturedOrder, 'ORDER-1');
    assert.equal(await paymentStatus(requestId), 'paid');
  });

  it('rejects a delivery that fails verification (401)', async () => {
    setPaypalWebhookVerifierForTests(() => Promise.reject(new AppError('bad signature', 401)));
    assert.equal((await postWebhook()).status, 401);
  });

  it('acknowledges an unrelated event type without effect (200)', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const { requestId, payment } = await setupPayment();
    setPaypalWebhookVerifierForTests(() =>
      Promise.resolve({
        type: 'BILLING.SUBSCRIPTION.CREATED',
        paymentId: payment.id,
        orderId: null,
      }),
    );

    assert.equal((await postWebhook()).status, 200);
    assert.equal(await paymentStatus(requestId), 'pending');
  });

  it('is disabled (404) when PayPal webhooks are not configured', async () => {
    // No override and no PayPal env → the endpoint is off.
    assert.equal((await postWebhook()).status, 404);
  });
});
