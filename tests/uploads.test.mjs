import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetUploads } from '../server/src/services/uploadService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function authHeader() {
  return `Bearer ${signToken({ id: CUSTOMER_ID, role: 'customer' })}`;
}

// A tiny non-empty byte blob; the mock store keeps and serves bytes verbatim.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('Image uploads', () => {
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

  beforeEach(() => {
    resetUploads();
  });

  function requestTarget(contentType) {
    return fetch(`${baseUrl}/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ contentType }),
    });
  }

  it('issues a target, stores the bytes, and serves them back', async () => {
    const target = await (await requestTarget('image/png')).json();
    assert.equal(target.uploadUrl, `/uploads/${target.id}`);

    const put = await fetch(`${baseUrl}${target.uploadUrl}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', Authorization: authHeader() },
      body: PNG_BYTES,
    });
    assert.equal(put.status, 204);

    const get = await fetch(`${baseUrl}${target.publicUrl}`);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), PNG_BYTES);
  });

  it('rejects a non-image content type when requesting a target (422)', async () => {
    assert.equal((await requestTarget('application/pdf')).status, 422);
  });

  it('rejects an upload with an unsupported content type (415)', async () => {
    const target = await (await requestTarget('image/png')).json();
    const put = await fetch(`${baseUrl}${target.uploadUrl}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain', Authorization: authHeader() },
      body: 'not an image',
    });
    assert.equal(put.status, 415);
  });

  it('returns 404 for an unknown image and 401 without auth', async () => {
    const missing = await fetch(`${baseUrl}/uploads/999e4567-e89b-12d3-a456-426614174000`);
    assert.equal(missing.status, 404);

    const anon = await fetch(`${baseUrl}/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/png' }),
    });
    assert.equal(anon.status, 401);
  });
});
