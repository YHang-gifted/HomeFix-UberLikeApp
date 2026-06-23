import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ApiClient, ApiError } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';

describe('ApiClient unauthorized handling (against in-process server)', () => {
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

  it('invokes the unauthorized handler on a 401 from an authenticated request', async () => {
    const client = new ApiClient(baseUrl);
    let calls = 0;
    client.setUnauthorizedHandler(() => {
      calls += 1;
    });
    client.setToken('invalid.token.value');

    await assert.rejects(
      () => client.listServiceRequests(),
      (error) => error instanceof ApiError && error.status === 401,
    );
    assert.equal(calls, 1);
  });

  it('does not invoke the handler on a 401 from an unauthenticated request (login)', async () => {
    const client = new ApiClient(baseUrl);
    let calls = 0;
    client.setUnauthorizedHandler(() => {
      calls += 1;
    });

    await assert.rejects(
      () => client.login('customer@homefix.test', 'wrong-pass'),
      (error) => error instanceof ApiError && error.status === 401,
    );
    assert.equal(calls, 0);
  });
});
