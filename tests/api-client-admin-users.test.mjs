import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { ApiClient, isApiError } from '../app/src/services/apiClient.ts';

describe('ApiClient admin user management (e2e)', () => {
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

  async function adminClient() {
    const client = new ApiClient(baseUrl);
    await client.login('admin@homefix.test', 'admin-pass');
    return client;
  }

  async function registerVictim() {
    const client = new ApiClient(baseUrl);
    await client.register({
      email: `au-${randomUUID()}@homefix.test`,
      password: 'orig-pass-123',
      displayName: 'Victim',
      role: 'customer',
    });
    return client.getPrincipal()?.id;
  }

  it('lists, suspends, and reinstates an account', async () => {
    const admin = await adminClient();
    const victimId = await registerVictim();

    const listed = await admin.adminListUsers();
    assert.equal(listed.find((u) => u.id === victimId)?.status, 'active');

    assert.equal(await admin.adminSuspendUser(victimId), 'suspended');
    const afterSuspend = await admin.adminListUsers();
    assert.equal(afterSuspend.find((u) => u.id === victimId)?.status, 'suspended');

    assert.equal(await admin.adminReinstateUser(victimId), 'active');
  });

  it('rejects a non-admin caller with ApiError 403', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    await assert.rejects(
      () => customer.adminListUsers(),
      (error) => isApiError(error) && error.status === 403,
    );
  });
});
