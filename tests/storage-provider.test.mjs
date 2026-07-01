import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mockStorageProvider,
  selectStorageProvider,
} from '../server/src/services/storageProvider.ts';

describe('mockStorageProvider', () => {
  it('hands back same-origin upload and public URLs for a new id', () => {
    const target = mockStorageProvider.createUploadTarget({ contentType: 'image/jpeg' });

    assert.match(target.id, /^[0-9a-f-]{36}$/);
    assert.equal(target.uploadUrl, `/uploads/${target.id}`);
    assert.equal(target.publicUrl, `/uploads/${target.id}`);
    // Mock URLs are relative — the client resolves them against the API base — and
    // point back at our own API (no external object storage).
    assert.ok(!target.uploadUrl.startsWith('http'));
  });

  it('gives a distinct id to each target', () => {
    const a = mockStorageProvider.createUploadTarget({ contentType: 'image/png' });
    const b = mockStorageProvider.createUploadTarget({ contentType: 'image/png' });

    assert.notEqual(a.id, b.id);
  });

  it('selectStorageProvider returns the inert mock by default', () => {
    assert.equal(selectStorageProvider(), mockStorageProvider);
  });
});
