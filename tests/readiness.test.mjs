import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import express from 'express';
import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../server/src/app.ts';
import { createHealthRouter } from '../server/src/routes/health.ts';
import { checkDatabase, checkReadiness } from '../server/src/db/health.ts';

describe('checkDatabase / checkReadiness', () => {
  it('reports skipped when no database is configured', async () => {
    assert.equal(await checkDatabase(undefined), 'skipped');
    assert.deepEqual(await checkReadiness(undefined), { ready: true, database: 'skipped' });
  });

  it('reports ok when the database answers the probe', async () => {
    const pg = new PGlite();
    const db = { query: (text, params) => pg.query(text, params) };
    assert.equal(await checkDatabase(db), 'ok');
    assert.deepEqual(await checkReadiness(db), { ready: true, database: 'ok' });
    await pg.close();
  });

  it('reports down (not ready) when the probe throws', async () => {
    const db = {
      query: () => Promise.reject(new Error('connection refused')),
    };
    assert.equal(await checkDatabase(db), 'down');
    assert.deepEqual(await checkReadiness(db), { ready: false, database: 'down' });
  });
});

describe('GET /ready (via createApp, in-memory mode)', () => {
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

  it('returns 200 and database skipped without DATABASE_URL', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ready, true);
    assert.equal(body.database, 'skipped');
  });
});

describe('GET /ready route mapping (injected database)', () => {
  function appWith(resolveDatabase) {
    const app = express();
    app.use(createHealthRouter(resolveDatabase));
    return app;
  }

  async function listen(app) {
    return await new Promise((resolve) => {
      const server = app.listen(0, () => {
        resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
      });
    });
  }

  it('returns 200 when the database probe succeeds', async () => {
    const { server, baseUrl } = await listen(
      appWith(() => ({ query: () => Promise.resolve({ rows: [{ '?column?': 1 }] }) })),
    );
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).database, 'ok');
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns 503 when the database is down', async () => {
    const { server, baseUrl } = await listen(
      appWith(() => ({ query: () => Promise.reject(new Error('down')) })),
    );
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ready, false);
    assert.equal(body.database, 'down');
    await new Promise((resolve) => server.close(resolve));
  });
});
