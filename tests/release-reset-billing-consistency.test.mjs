import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetCertifications } from '../server/src/services/certificationService.ts';
import { seedVerifiedCertification } from './certification-fixtures.mjs';

// Cross-domain regression for SEC-0005: returning a job to the pool (worker
// release / admin reset) must not leave the previous worker's quote or payment
// behind, and a paid job must not be releasable/resettable at all (no refund
// flow). Without the fix, a released job kept its old one-per-request quote, so a
// new worker hit a 409 and could never re-quote.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_A = '423e4567-e89b-12d3-a456-426614174000';
const WORKER_B = '523e4567-e89b-12d3-a456-426614174999';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('release/reset billing consistency (SEC-0005)', () => {
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
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await resetServiceRequests();
    await resetAuditEvents();
    await resetNotifications();
    await resetQuotes();
    await resetPayments();
    // Worker B claims the released plumbing job; that needs a verified plumbing
    // certification under credential-gated matching.
    await resetCertifications();
    await seedVerifiedCertification(baseUrl, WORKER_A, 'plumbing');
    await seedVerifiedCertification(baseUrl, WORKER_B, 'plumbing');
  });

  const api = (path, method, id, role, body) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  async function createAssignedToA() {
    const request = await (
      await api('/service-requests', 'POST', CUSTOMER_ID, 'customer', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    await api(`/service-requests/${request.id}/assignment`, 'PATCH', ADMIN_ID, 'admin', {
      workerId: WORKER_A,
    });
    return request;
  }

  async function quoteAcceptPay(requestId, { pay }) {
    await api(`/service-requests/${requestId}/quote`, 'POST', WORKER_A, 'worker', {
      amountCents: AMOUNT,
    });
    await api(`/service-requests/${requestId}/quote/accept`, 'POST', CUSTOMER_ID, 'customer');
    await api(`/service-requests/${requestId}/payment`, 'POST', CUSTOMER_ID, 'customer', {
      amountCents: AMOUNT,
    });
    if (pay) {
      await api(`/service-requests/${requestId}/payment/pay`, 'POST', CUSTOMER_ID, 'customer');
    }
  }

  it('worker release clears the old quote + unpaid payment so a new worker can re-quote', async () => {
    const request = await createAssignedToA();
    await quoteAcceptPay(request.id, { pay: false }); // quote + accepted + pending payment

    const released = await api(
      `/service-requests/${request.id}/release`,
      'PATCH',
      WORKER_A,
      'worker',
    );
    assert.equal(released.status, 200);

    // Old worker's quote and unpaid payment are gone.
    assert.equal(
      (await api(`/service-requests/${request.id}/quote`, 'GET', CUSTOMER_ID, 'customer')).status,
      404,
    );
    assert.equal(
      (await api(`/service-requests/${request.id}/payment`, 'GET', CUSTOMER_ID, 'customer')).status,
      404,
    );

    // A new worker claims and CAN submit a fresh quote (was a 409 before the fix).
    assert.equal(
      (await api(`/service-requests/${request.id}/claim`, 'PATCH', WORKER_B, 'worker')).status,
      200,
    );
    const reQuote = await api(`/service-requests/${request.id}/quote`, 'POST', WORKER_B, 'worker', {
      amountCents: 160000,
    });
    assert.equal(reQuote.status, 201);
    const quote = await reQuote.json();
    assert.equal(quote.workerId, WORKER_B);
    assert.equal(quote.amountCents, 160000);
  });

  it('a paid job cannot be released or reset, and its payment is preserved', async () => {
    const request = await createAssignedToA();
    await quoteAcceptPay(request.id, { pay: true }); // fully paid

    assert.equal(
      (await api(`/service-requests/${request.id}/release`, 'PATCH', WORKER_A, 'worker')).status,
      422,
    );
    assert.equal(
      (await api(`/service-requests/${request.id}/reset`, 'PATCH', ADMIN_ID, 'admin')).status,
      422,
    );

    // The job is untouched: still assigned to A, payment still paid.
    const detail = await (
      await api(`/service-requests/${request.id}`, 'GET', ADMIN_ID, 'admin')
    ).json();
    assert.equal(detail.workerId, WORKER_A);
    assert.notEqual(detail.status, 'pending');
    const payment = await (
      await api(`/service-requests/${request.id}/payment`, 'GET', CUSTOMER_ID, 'customer')
    ).json();
    assert.equal(payment.status, 'paid');
  });

  it('admin reset clears the old quote + unpaid payment', async () => {
    const request = await createAssignedToA();
    await quoteAcceptPay(request.id, { pay: false });

    const reset = await api(`/service-requests/${request.id}/reset`, 'PATCH', ADMIN_ID, 'admin');
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).status, 'pending');

    assert.equal(
      (await api(`/service-requests/${request.id}/quote`, 'GET', CUSTOMER_ID, 'customer')).status,
      404,
    );
    assert.equal(
      (await api(`/service-requests/${request.id}/payment`, 'GET', CUSTOMER_ID, 'customer')).status,
      404,
    );
  });
});
