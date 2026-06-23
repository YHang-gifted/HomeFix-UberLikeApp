import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function validRequest() {
  return {
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };
}

describe('ApiClient workers + assignment (against in-process server)', () => {
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

  it('lists workers and assigns one to a pending request as an admin', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const created = await customer.createServiceRequest(validRequest());
    assert.equal(created.status, 'pending');

    const admin = new ApiClient(baseUrl);
    await admin.login('admin@homefix.test', 'admin-pass');

    const workers = await admin.listWorkers();
    const worker = workers.find((candidate) => candidate.id === WORKER_ID);
    assert.ok(worker);

    const assigned = await admin.assignWorker(created.id, worker.id);
    assert.equal(assigned.status, 'matched');
    assert.equal(assigned.workerId, WORKER_ID);
  });
});
