import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPayments,
  resetPaymentProviderForTests,
  resetStripeRefunderForTests,
  setPaymentProviderForTests,
  setStripeRefunderForTests,
} from '../server/src/services/paymentService.ts';
import { resetPayouts } from '../server/src/services/payoutService.ts';

// slice 161: an admin refund of a Stripe payment reverses the charge at the provider
// (real refund) before the payment is marked refunded.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;
const PROVIDER_REF = 'pi_123';

const fakeStripeProvider = {
  id: 'stripe',
  usesExternalCheckout: true,
  createCharge: () =>
    Promise.resolve({ providerRef: PROVIDER_REF, checkoutUrl: 'https://checkout.stripe.com/x' }),
};

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Stripe refund at the provider', () => {
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
    resetStripeRefunderForTests();
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
    resetStripeRefunderForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Create a Stripe payment and settle it via the provider webhook; return requestId. */
  async function setupPaidStripePayment() {
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
    // Settle it (external providers settle only via the verified webhook).
    await fetch(`${baseUrl}/webhooks/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payment.succeeded', providerRef: PROVIDER_REF }),
    });
    return request.id;
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('reverses the charge at Stripe, then marks the payment refunded', async () => {
    setPaymentProviderForTests(fakeStripeProvider);
    let refundedRef;
    setStripeRefunderForTests((ref) => {
      refundedRef = ref;
      return Promise.resolve();
    });

    const requestId = await setupPaidStripePayment();
    assert.equal(await paymentStatus(requestId), 'paid');

    const res = await api(
      ADMIN_ID,
      'admin',
      'POST',
      `/service-requests/${requestId}/payment/refund`,
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'refunded');
    // The refund targeted the stored PaymentIntent reference.
    assert.equal(refundedRef, PROVIDER_REF);
  });

  it('does not mark refunded when the Stripe refund fails', async () => {
    setPaymentProviderForTests(fakeStripeProvider);
    setStripeRefunderForTests(() => Promise.reject(new Error('stripe down')));

    const requestId = await setupPaidStripePayment();
    const res = await api(
      ADMIN_ID,
      'admin',
      'POST',
      `/service-requests/${requestId}/payment/refund`,
    );
    assert.equal(res.status, 500);
    // The payment is still paid — the refund was not recorded.
    assert.equal(await paymentStatus(requestId), 'paid');
  });
});
