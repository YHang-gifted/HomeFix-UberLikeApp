import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('ApiClient notifications (against in-process server)', () => {
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
    await resetNotifications();
  });

  it('lists and marks notifications read', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const created = await customer.createServiceRequest({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });

    await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${signToken({ id: ADMIN_ID, role: 'admin' })}`,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });

    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');
    const list = await worker.listNotifications();
    assert.equal(list.unreadCount, 1);

    const updated = await worker.markNotificationRead(list.items[0].id);
    assert.equal(updated.read, true);
    const after = await worker.listNotifications();
    assert.equal(after.unreadCount, 0);
  });
});
