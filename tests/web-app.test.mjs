import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

describe('same-origin web app serving', () => {
  let server;
  let baseUrl;
  let distDir;
  let previous;

  before(async () => {
    distDir = mkdtempSync(join(tmpdir(), 'homefix-web-'));
    writeFileSync(
      join(distDir, 'index.html'),
      '<!doctype html><title>HomeFix</title><div id="root"></div>',
    );
    mkdirSync(join(distDir, 'assets'), { recursive: true });
    writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("hi");');

    previous = process.env['WEB_DIST_DIR'];
    process.env['WEB_DIST_DIR'] = distDir;

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(() => resolve()));
    if (previous === undefined) {
      delete process.env['WEB_DIST_DIR'];
    } else {
      process.env['WEB_DIST_DIR'] = previous;
    }
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves index.html for a browser navigation to the root', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /HomeFix/);
  });

  it('serves a real static asset', async () => {
    const res = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /console\.log/);
  });

  it('serves the SPA shell for a client-side route (deep-link refresh)', async () => {
    const res = await fetch(`${baseUrl}/requests/123`, { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /id="root"/);
  });

  it('does not shadow the API: an unauthenticated API call still 401s', async () => {
    const res = await fetch(`${baseUrl}/service-requests`, {
      headers: { accept: 'application/json' },
    });
    assert.equal(res.status, 401);
  });

  it('returns 404 (not the SPA shell) for an unknown API path requested as JSON', async () => {
    const res = await fetch(`${baseUrl}/nope`, { headers: { accept: 'application/json' } });
    assert.equal(res.status, 404);
  });
});
