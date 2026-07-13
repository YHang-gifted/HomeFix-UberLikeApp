import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';

// slice 183. `Referrer-Policy: no-referrer` is a PREREQUISITE for the password-reset magic
// link, not a nicety. That link carries the plaintext reset token in its query string, so the
// moment the page it opens requests anything third-party — and the web app loads the Google
// Maps JS SDK — the browser would attach the full URL, token included, as the `Referer`. The
// secret we keep out of our own logs would be handed to someone else's.

describe('security headers', () => {
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

  it('never sends a Referer, so a token in a URL cannot leak to a third party', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });

  it('sets the other cheap hardening headers', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('sets them on error responses too (a 404 is still a page)', async () => {
    const res = await fetch(`${baseUrl}/no-such-route`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });
});
