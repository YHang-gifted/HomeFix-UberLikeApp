import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';

import { createRequestLogger } from '../server/src/middlewares/requestLogger.ts';

/** Spin up a one-route app with the logger and a captured sink; return helpers. */
function makeApp(clock) {
  const entries = [];
  const app = express();
  app.use(createRequestLogger((entry) => entries.push(entry), clock));
  app.get('/widgets/:id', (req, res) => {
    res.status(200).json({ id: req.params.id });
  });
  app.post('/boom', (_req, res) => {
    res.status(500).json({ error: 'nope' });
  });
  return { app, entries };
}

async function listen(app) {
  return await new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

describe('createRequestLogger', () => {
  it('logs one structured entry per request with method, path, status, duration', async () => {
    let t = 0;
    const clock = () => (t += 5); // start=5, finish=10 -> 5ms
    const { app, entries } = makeApp(clock);
    const { server, baseUrl } = await listen(app);

    const res = await fetch(`${baseUrl}/widgets/42?secret=shh`);
    assert.equal(res.status, 200);

    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.method, 'GET');
    assert.equal(entry.path, '/widgets/42');
    assert.equal(entry.status, 200);
    assert.equal(entry.durationMs, 5);
    assert.equal(typeof entry.requestId, 'string');
    assert.ok(entry.requestId.length > 0);

    await new Promise((r) => server.close(r));
  });

  it('never includes the query string (no secret leakage in the path)', async () => {
    const { app, entries } = makeApp();
    const { server, baseUrl } = await listen(app);

    await fetch(`${baseUrl}/widgets/7?token=topsecret&password=hunter2`);
    assert.doesNotMatch(entries[0].path, /topsecret|hunter2|token|password/);
    assert.equal(entries[0].path, '/widgets/7');

    await new Promise((r) => server.close(r));
  });

  it('echoes a generated X-Request-Id back on the response', async () => {
    const { app, entries } = makeApp();
    const { server, baseUrl } = await listen(app);

    const res = await fetch(`${baseUrl}/widgets/1`);
    const header = res.headers.get('x-request-id');
    assert.ok(header && header.length > 0);
    assert.equal(header, entries[0].requestId);

    await new Promise((r) => server.close(r));
  });

  it('reuses an inbound X-Request-Id for correlation', async () => {
    const { app, entries } = makeApp();
    const { server, baseUrl } = await listen(app);

    const res = await fetch(`${baseUrl}/widgets/1`, {
      headers: { 'X-Request-Id': 'trace-abc-123' },
    });
    assert.equal(res.headers.get('x-request-id'), 'trace-abc-123');
    assert.equal(entries[0].requestId, 'trace-abc-123');

    await new Promise((r) => server.close(r));
  });

  it('records the real status code for error responses', async () => {
    const { app, entries } = makeApp();
    const { server, baseUrl } = await listen(app);

    await fetch(`${baseUrl}/boom`, { method: 'POST' });
    assert.equal(entries[0].method, 'POST');
    assert.equal(entries[0].status, 500);

    await new Promise((r) => server.close(r));
  });
});
