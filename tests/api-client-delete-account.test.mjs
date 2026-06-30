import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { ApiClient, isApiError } from '../app/src/services/apiClient.ts';

describe('ApiClient.deleteAccount (e2e)', () => {
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
    const email = `del-${randomUUID()}@homefix.test`;
    const client = new ApiClient(baseUrl);
    await client.register({
      email,
      password: 'orig-pass-123',
      displayName: 'Test User',
      role: 'customer',
    });
    return { email, client };
  }

  it('deletes the account, clears the local token, and blocks future sign-in', async () => {
    const { email, client } = await registerFresh();
    await client.deleteAccount('orig-pass-123');

    // The client dropped its token, and the original credentials no longer work.
    assert.equal(client.getToken(), undefined);
    const fresh = new ApiClient(baseUrl);
    await assert.rejects(
      () => fresh.login(email, 'orig-pass-123'),
      (error) => isApiError(error) && error.status === 401,
    );
  });

  it('rejects a wrong current password with ApiError 401 and keeps the account', async () => {
    const { email, client } = await registerFresh();
    await assert.rejects(
      () => client.deleteAccount('wrong-current'),
      (error) => isApiError(error) && error.status === 401,
    );

    const fresh = new ApiClient(baseUrl);
    assert.equal(typeof (await fresh.login(email, 'orig-pass-123')), 'string');
  });
});
