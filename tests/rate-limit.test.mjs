import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import { createRateLimiter } from '../server/src/middlewares/rateLimit.ts';
import { errorHandler } from '../server/src/middlewares/errorHandler.ts';

describe('createRateLimiter', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.post('/thing', createRateLimiter({ windowMs: 60_000, max: 2 }), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use(errorHandler);
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

  it('allows requests up to the limit, then returns 429', async () => {
    const first = await fetch(`${baseUrl}/thing`, { method: 'POST' });
    assert.equal(first.status, 200);
    const second = await fetch(`${baseUrl}/thing`, { method: 'POST' });
    assert.equal(second.status, 200);
    const third = await fetch(`${baseUrl}/thing`, { method: 'POST' });
    assert.equal(third.status, 429);
  });
});
