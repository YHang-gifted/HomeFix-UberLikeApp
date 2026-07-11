import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import {
  resetPayouts,
  resetPayoutSenderForTests,
  setPayoutSenderForTests,
} from '../server/src/services/payoutService.ts';
import {
  resetConnectOnboarderForTests,
  setConnectOnboarderForTests,
} from '../server/src/services/connectService.ts';
import { handleConnectWebhook } from '../server/src/services/connectWebhookService.ts';

// SEC-0008: a provider `payment.refunded` webhook (a refund issued outside our admin flow —
// e.g. from the Stripe/PayPal dashboard, or a chargeback) must reconcile the worker's payout
// too. It removes a still-pending payout (no double-pay) but NEVER throws — the refund
// already happened at the provider, so the webhook must be acknowledged (200); an
// already-paid-out payout is left for a manual clawback. Sibling of SEC-0007 (admin path).

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('SEC-0008: refund webhook reconciles the worker payout', () => {
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
    resetPayoutSenderForTests();
    resetConnectOnboarderForTests();
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
    resetPayoutSenderForTests();
    resetConnectOnboarderForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to a paid (mock) payment; returns the payment (incl. providerRef). */
  async function driveToPaid() {
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
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment/pay`);
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${request.id}/payment`)
    ).json();
    return payment;
  }

  function payouts() {
    return api(WORKER_ID, 'worker', 'GET', '/payouts').then((res) => res.json());
  }

  function refundWebhook(providerRef) {
    return fetch(`${baseUrl}/webhooks/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payment.refunded', providerRef }),
    });
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('removes a still-pending payout on a refund webhook (and settles the refund)', async () => {
    const payment = await driveToPaid();
    assert.equal((await payouts()).items.length, 1);

    const res = await refundWebhook(payment.providerRef);
    assert.equal(res.status, 200);
    assert.equal(await paymentStatus(payment.requestId), 'refunded');
    assert.equal((await payouts()).items.length, 0);
  });

  it('acknowledges the webhook (200) without reversing an already-paid-out payout', async () => {
    setConnectOnboarderForTests(() =>
      Promise.resolve({ accountId: 'acct_1', url: 'https://connect.stripe.com/onboard/x' }),
    );
    await api(WORKER_ID, 'worker', 'POST', '/me/connect/onboard');
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_1',
      payoutsEnabled: true,
    });
    setPayoutSenderForTests(() => Promise.resolve());

    const payment = await driveToPaid();
    assert.equal((await payouts()).items[0].status, 'paid');

    const res = await refundWebhook(payment.providerRef);
    assert.equal(res.status, 200);
    // The refund is recorded, but the already-sent payout stays paid (manual clawback).
    assert.equal(await paymentStatus(payment.requestId), 'refunded');
    assert.equal((await payouts()).items[0].status, 'paid');
  });
});
