import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetAuditEvents } from '../server/src/services/auditService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('ApiClient.listAuditEvents (against in-process server)', () => {
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
  });

  it('lets an admin read audit events produced by a customer action', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    await customer.createServiceRequest({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });

    const admin = new ApiClient(baseUrl);
    await admin.login('admin@homefix.test', 'admin-pass');
    const page = await admin.listAuditEvents();

    assert.ok(page.total >= 1);
    assert.ok(page.items.some((event) => event.action === 'service_request.created'));
  });
});
