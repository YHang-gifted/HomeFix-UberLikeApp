import assert from 'node:assert/strict';
import { Blob } from 'node:buffer';
import { afterEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace fetch with a stub that records calls and returns a 200. */
function stubFetch() {
  const calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true, status: 200 });
  };
  return calls;
}

describe('ApiClient.putUploadBytes', () => {
  it('attaches the bearer token for a same-origin (relative) upload URL', async () => {
    const client = new ApiClient('http://api.test');
    client.setToken('tok-123');
    const calls = stubFetch();

    await client.putUploadBytes('/uploads/abc', 'image/png', new Blob(['x']));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://api.test/uploads/abc');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-123');
    assert.equal(calls[0].init.headers['content-type'], 'image/png');
  });

  it('does NOT attach a bearer token to an absolute presigned URL (S3)', async () => {
    const client = new ApiClient('http://api.test');
    client.setToken('tok-123');
    const calls = stubFetch();
    const presigned =
      'https://bucket.s3.ap-northeast-1.amazonaws.com/uploads/abc.png?X-Amz-Signature=deadbeef';

    await client.putUploadBytes(presigned, 'image/png', new Blob(['x']));

    // The presigned URL is used verbatim and carries no Authorization header.
    assert.equal(calls[0].url, presigned);
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].init.headers['content-type'], 'image/png');
  });

  it('requires a token for a same-origin upload (401)', async () => {
    const client = new ApiClient('http://api.test');
    stubFetch();

    await assert.rejects(
      () => client.putUploadBytes('/uploads/abc', 'image/png', new Blob(['x'])),
      (error) => error.status === 401,
    );
  });
});
