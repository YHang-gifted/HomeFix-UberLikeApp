import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { ApiClient, isApiError } from '../app/src/services/apiClient.ts';

describe('ApiClient forgot/reset password (e2e)', () => {
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

  it('forgotPassword resolves for any email (no account disclosure)', async () => {
    const client = new ApiClient(baseUrl);
    await client.forgotPassword('customer@homefix.test');
    await client.forgotPassword('nobody@homefix.test');
  });

  it('resetPassword throws ApiError(400) for an invalid token', async () => {
    const client = new ApiClient(baseUrl);
    await assert.rejects(
      () => client.resetPassword('bogus-token', 'newpass123'),
      (error) => isApiError(error) && error.status === 400,
    );
  });
});
