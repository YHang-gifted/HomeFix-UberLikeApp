import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

describe('CORS middleware', () => {
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

  it('answers an OPTIONS preflight with 204 and CORS headers', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'OPTIONS' });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    const methods = response.headers.get('access-control-allow-methods') ?? '';
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
      assert.match(methods, new RegExp(method), `allow-methods should include ${method}`);
    }
    assert.match(response.headers.get('access-control-allow-headers') ?? '', /Authorization/);
  });

  it('includes the allow-origin header on a normal response', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
  });
});
