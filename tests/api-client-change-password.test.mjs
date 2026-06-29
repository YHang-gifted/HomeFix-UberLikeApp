import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { ApiClient, isApiError } from '../app/src/services/apiClient.ts';

describe('ApiClient.changePassword (e2e)', () => {
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

  async function registerFresh() {
    const email = `cpw-${randomUUID()}@homefix.test`;
    const client = new ApiClient(baseUrl);
    await client.register({
      email,
      password: 'orig-pass-123',
      displayName: 'Test User',
      role: 'customer',
    });
    return { email, client };
  }

  it('changes the password so the new one logs in and the old one fails', async () => {
    const { email, client } = await registerFresh();
    const oldToken = client.getToken();
    await client.changePassword('orig-pass-123', 'new-pass-456');

    // The client adopted a fresh token and its session still works.
    assert.notEqual(client.getToken(), oldToken);
    assert.ok(await client.getMe());

    const fresh = new ApiClient(baseUrl);
    assert.equal(typeof (await fresh.login(email, 'new-pass-456')), 'string');

    const stale = new ApiClient(baseUrl);
    await assert.rejects(
      () => stale.login(email, 'orig-pass-123'),
      (error) => isApiError(error) && error.status === 401,
    );
  });

  it('logoutAll revokes other sessions and keeps the current one working', async () => {
    const { client } = await registerFresh();
    const otherDevice = new ApiClient(baseUrl);
    otherDevice.setToken(client.getToken());

    await client.logoutAll();

    // The current client adopted a fresh token and still works...
    assert.ok(await client.getMe());
    // ...while the other device's now-stale token is rejected.
    await assert.rejects(
      () => otherDevice.getMe(),
      (error) => isApiError(error) && error.status === 401,
    );
  });

  it('rejects a wrong current password with ApiError 401', async () => {
    const { client } = await registerFresh();
    await assert.rejects(
      () => client.changePassword('wrong-current', 'new-pass-456'),
      (error) => isApiError(error) && error.status === 401,
    );
  });
});
