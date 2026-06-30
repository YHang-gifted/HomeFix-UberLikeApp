import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { uploadPickedImage } from '../app/src/features/uploads/uploadImage.ts';

describe('uploadPickedImage', () => {
  it('creates a target, PUTs the bytes, and returns the resolved public URL', async () => {
    const calls = [];
    const blob = { fake: 'blob' };
    const client = {
      createUpload: (contentType) => {
        calls.push(['createUpload', contentType]);
        return Promise.resolve({ id: 'x', uploadUrl: '/uploads/x', publicUrl: '/uploads/x' });
      },
      putUploadBytes: (uploadUrl, contentType, body) => {
        calls.push(['putUploadBytes', uploadUrl, contentType, body]);
        return Promise.resolve();
      },
      resolveUrl: (path) => `https://api.test${path}`,
    };

    const url = await uploadPickedImage(client, { blob, contentType: 'image/png' });

    assert.equal(url, 'https://api.test/uploads/x');
    assert.deepEqual(calls, [
      ['createUpload', 'image/png'],
      ['putUploadBytes', '/uploads/x', 'image/png', blob],
    ]);
  });
});
