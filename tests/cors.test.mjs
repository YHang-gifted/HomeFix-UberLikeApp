import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { createApp } from '../server/src/app.ts';
import { createCorsMiddleware } from '../server/src/middlewares/cors.ts';

describe('CORS middleware (dev default, via createApp)', () => {
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

  it('answers an OPTIONS preflight with 204 and permissive CORS headers', async () => {
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

describe('CORS allowlist (production, createCorsMiddleware)', () => {
  let server;
  let baseUrl;
  const ALLOWED = 'https://app.homefix.example';

  before(async () => {
    const app = express();
    app.use(createCorsMiddleware([ALLOWED]));
    app.get('/health', (_req, res) => {
      res.status(200).json({ ok: true });
    });
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

  it('echoes back an allowed origin (not *) and varies on Origin', async () => {
    const response = await fetch(`${baseUrl}/health`, { headers: { Origin: ALLOWED } });
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED);
    assert.match(response.headers.get('vary') ?? '', /Origin/);
  });

  it('omits the allow-origin header for a disallowed origin', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });

  it('never returns * when an allowlist is configured', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
  });
});
