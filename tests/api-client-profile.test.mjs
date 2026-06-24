import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';

describe('ApiClient profile (against in-process server)', () => {
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

  it('reads and updates the profile', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('admin@homefix.test', 'admin-pass');

    const me = await client.getMe();
    assert.equal(me.email, 'admin@homefix.test');
    assert.equal(me.role, 'admin');

    const updated = await client.updateProfile({ displayName: 'Alice Admin' });
    assert.equal(updated.displayName, 'Alice Admin');
  });
});
