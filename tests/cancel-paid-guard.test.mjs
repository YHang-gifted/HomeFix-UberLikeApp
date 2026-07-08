import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';

// SEC-0006: a paid service request must not be cancellable (no refund flow), just as
// SEC-0005 blocks release/reset on a paid job.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const AMOUNT = 150000;

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('cancel guard on a paid request (SEC-0006)', () => {
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
    await resetQuotes();
    await resetPayments();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function createRequest() {
    return (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
  }

  function cancel(id) {
    return api(CUSTOMER_ID, 'customer', 'PATCH', `/service-requests/${id}/status`, {
      status: 'cancelled',
    });
  }

  function paymentStatus(id) {
    return api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${id}/payment`)
      .then((res) => res.json())
      .then((body) => body.status);
  }

  it('rejects cancelling a paid request (422) and preserves the payment', async () => {
    const request = await createRequest();
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
    assert.equal(await paymentStatus(request.id), 'paid');

    const res = await cancel(request.id);
    assert.equal(res.status, 422);

    // The request is not cancelled and the payment is intact.
    const detail = await (
      await api(CUSTOMER_ID, 'customer', 'GET', `/service-requests/${request.id}`)
    ).json();
    assert.notEqual(detail.status, 'cancelled');
    assert.equal(await paymentStatus(request.id), 'paid');
  });

  it('still allows cancelling an unpaid request', async () => {
    const request = await createRequest();
    const res = await cancel(request.id);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'cancelled');
  });
});
