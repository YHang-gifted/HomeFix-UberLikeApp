import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPayments,
  resetPaymentProviderForTests,
} from '../server/src/services/paymentService.ts';
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

// slice 164: a scheduled payout is transferred to the worker's connected account and
// settled — best-effort, so it stays pending when the worker hasn't onboarded or the
// transfer fails.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;
const WORKER_NET = AMOUNT - 22500; // 15% fee floored.

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('Connect payout transfer', () => {
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
    resetPaymentProviderForTests();
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
    resetPaymentProviderForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function onboardWorker() {
    setConnectOnboarderForTests(() =>
      Promise.resolve({ accountId: 'acct_1', url: 'https://connect.stripe.com/onboard/x' }),
    );
    await api(WORKER_ID, 'worker', 'POST', '/me/connect/onboard');
    // Stripe's account.updated confirms the connected account can receive payouts; only
    // then does a transfer fire (slice 166 gates on payouts_enabled).
    await handleConnectWebhook({
      type: 'account.updated',
      accountId: 'acct_1',
      payoutsEnabled: true,
    });
  }

  /** Drive a request to a paid (mock) payment, which schedules the worker's payout. */
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
  }

  function payouts() {
    return api(WORKER_ID, 'worker', 'GET', '/payouts').then((res) => res.json());
  }

  // Runs first, while the seeded worker still has no connected account.
  it('leaves the payout pending when the worker has not onboarded', async () => {
    setPayoutSenderForTests(() => Promise.resolve());
    await driveToPaid();
    const page = await payouts();
    assert.equal(page.items[0].status, 'pending');
  });

  it('leaves the payout pending when the transfer fails', async () => {
    await onboardWorker();
    setPayoutSenderForTests(() => Promise.reject(new Error('transfer failed')));
    await driveToPaid();
    const page = await payouts();
    assert.equal(page.items[0].status, 'pending');
  });

  it('transfers the net to the connected account and settles the payout', async () => {
    await onboardWorker();
    let sent;
    setPayoutSenderForTests((input) => {
      sent = input;
      return Promise.resolve();
    });

    await driveToPaid();

    const page = await payouts();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].status, 'paid');
    assert.equal(sent.destinationAccountId, 'acct_1');
    assert.equal(sent.amountCents, WORKER_NET);
  });
});
