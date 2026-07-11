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

// SEC-0007: a direct admin refund must reconcile the worker's payout. A still-pending
// payout is removed (so it can never transfer after the customer has been refunded — no
// double-pay); an already-paid-out payout aborts the refund with 409 (manual clawback), so
// money is never refunded to the customer while the worker keeps their net.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('SEC-0007: refund reconciles the worker payout', () => {
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

  /** Drive a request to a paid (mock) payment; returns the request id. */
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
    return request.id;
  }

  function payouts() {
    return api(WORKER_ID, 'worker', 'GET', '/payouts').then((res) => res.json());
  }

  function refund(requestId) {
    return api(ADMIN_ID, 'admin', 'POST', `/service-requests/${requestId}/payment/refund`);
  }

  function paymentStatus(requestId) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${requestId}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('removes a still-pending payout when the payment is refunded', async () => {
    const requestId = await driveToPaid();
    assert.equal((await payouts()).items.length, 1);
    assert.equal((await payouts()).items[0].status, 'pending');

    const res = await refund(requestId);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'refunded');

    // The pending payout is gone, so it can never transfer after the refund.
    assert.equal((await payouts()).items.length, 0);
  });

  it('aborts the refund (409) when the worker has already been paid out', async () => {
    // Onboard + enable payouts + a succeeding sender, so the payout settles to 'paid'.
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

    const requestId = await driveToPaid();
    assert.equal((await payouts()).items[0].status, 'paid');

    const res = await refund(requestId);
    assert.equal(res.status, 409);

    // Nothing moved: the payment is still paid and the payout is still paid.
    assert.equal(await paymentStatus(requestId), 'paid');
    assert.equal((await payouts()).items[0].status, 'paid');
  });
});
