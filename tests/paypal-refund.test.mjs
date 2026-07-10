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
  resetPaypalRefunderForTests,
  setPaymentProviderForTests,
  setPaypalCapturerForTests,
  setPaypalRefunderForTests,
} from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// slice 162: an admin refund of a PayPal payment refunds the capture at PayPal (real
// refund by the capture id stored at capture time) before marking it refunded.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;
const CAPTURE_ID = 'CAP-1';

const fakePaypalProvider = {
  id: 'paypal',
  usesExternalCheckout: true,
  createCharge: () => Promise.resolve({ providerRef: 'ORDER-1', checkoutUrl: 'https://pp/O1' }),
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('PayPal refund at the provider', () => {
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
    resetPaypalRefunderForTests();
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
    resetPaypalRefunderForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Create a PayPal payment and capture it (storing the capture id); return requestId. */
  async function setupCapturedPaypalPayment() {
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
    setPaypalCapturerForTests(() =>
      Promise.resolve({ status: 'COMPLETED', paymentId: null, captureId: CAPTURE_ID }),
    );
    await api(
      CUSTOMER_ID,
      'customer',
      'POST',
      `/service-requests/${request.id}/payment/paypal/capture`,
    );
    return request.id;
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('refunds the capture at PayPal, then marks the payment refunded', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const requestId = await setupCapturedPaypalPayment();
    assert.equal(await paymentStatus(requestId), 'paid');

    let refundedRef;
    setPaypalRefunderForTests((ref) => {
      refundedRef = ref;
      return Promise.resolve();
    });

    const res = await api(
      ADMIN_ID,
      'admin',
      'POST',
      `/service-requests/${requestId}/payment/refund`,
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'refunded');
    // The refund targeted the stored capture id, not the order id.
    assert.equal(refundedRef, CAPTURE_ID);
  });

  it('does not mark refunded when the PayPal refund fails', async () => {
    setPaymentProviderForTests(fakePaypalProvider);
    const requestId = await setupCapturedPaypalPayment();
    setPaypalRefunderForTests(() => Promise.reject(new Error('paypal down')));

    const res = await api(
      ADMIN_ID,
      'admin',
      'POST',
      `/service-requests/${requestId}/payment/refund`,
    );
    assert.equal(res.status, 500);
    assert.equal(await paymentStatus(requestId), 'paid');
  });
});
