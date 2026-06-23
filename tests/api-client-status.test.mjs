import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function validRequest() {
  return {
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };
}

describe('ApiClient.updateServiceRequestStatus (against in-process server)', () => {
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
  });

  it('lets the assigned worker advance a request through its statuses', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const created = await customer.createServiceRequest(validRequest());

    // Admin assigns the worker (pending -> matched). No ApiClient method for this
    // worker-app slice, so use a signed admin token directly.
    const assignRes = await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${signToken({ id: ADMIN_ID, role: 'admin' })}`,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    assert.equal(assignRes.status, 200);

    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');

    const accepted = await worker.updateServiceRequestStatus(created.id, 'accepted');
    assert.equal(accepted.status, 'accepted');
    const inProgress = await worker.updateServiceRequestStatus(created.id, 'in_progress');
    assert.equal(inProgress.status, 'in_progress');
    const completed = await worker.updateServiceRequestStatus(created.id, 'completed');
    assert.equal(completed.status, 'completed');
  });
});
