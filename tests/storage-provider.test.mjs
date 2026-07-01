import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createS3StorageProvider,
  mockStorageProvider,
  s3ConfigFromEnv,
  selectStorageProvider,
} from '../server/src/services/storageProvider.ts';

describe('mockStorageProvider', () => {
  it('hands back same-origin upload and public URLs for a new id', async () => {
    const target = await mockStorageProvider.createUploadTarget({ contentType: 'image/jpeg' });

    assert.match(target.id, /^[0-9a-f-]{36}$/);
    assert.equal(target.uploadUrl, `/uploads/${target.id}`);
    assert.equal(target.publicUrl, `/uploads/${target.id}`);
    // Mock URLs are relative — the client resolves them against the API base — and
    // point back at our own API (no external object storage).
    assert.ok(!target.uploadUrl.startsWith('http'));
  });

  it('gives a distinct id to each target', async () => {
    const a = await mockStorageProvider.createUploadTarget({ contentType: 'image/png' });
    const b = await mockStorageProvider.createUploadTarget({ contentType: 'image/png' });

    assert.notEqual(a.id, b.id);
  });
});

describe('selectStorageProvider', () => {
  it('returns the inert mock when S3 is not configured', () => {
    assert.equal(selectStorageProvider({}), mockStorageProvider);
  });

  it('returns an S3 provider when the bucket, region, and credentials are set', () => {
    const provider = selectStorageProvider({
      STORAGE_S3_BUCKET: 'homefix-images',
      STORAGE_S3_REGION: 'ap-northeast-1',
      STORAGE_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
      STORAGE_S3_SECRET_ACCESS_KEY: 'secret-example',
      STORAGE_S3_UPLOAD_EXPIRES_SECONDS: 900,
    });

    assert.notEqual(provider, mockStorageProvider);
  });
});

describe('s3ConfigFromEnv', () => {
  it('is undefined when any required field is missing', () => {
    assert.equal(
      s3ConfigFromEnv({
        STORAGE_S3_BUCKET: 'b',
        STORAGE_S3_REGION: 'r',
        STORAGE_S3_ACCESS_KEY_ID: 'k',
        // secret missing
        STORAGE_S3_UPLOAD_EXPIRES_SECONDS: 900,
      }),
      undefined,
    );
  });
});

describe('createS3StorageProvider', () => {
  const provider = createS3StorageProvider({
    bucket: 'homefix-images',
    region: 'ap-northeast-1',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret-example',
    expiresInSeconds: 900,
  });

  it('presigns a PUT URL and derives the public object URL (no network call)', async () => {
    const target = await provider.createUploadTarget({ contentType: 'image/png' });

    // The upload URL is a presigned S3 URL bound to the bucket and signed with SigV4.
    assert.ok(target.uploadUrl.startsWith('https://'));
    assert.match(target.uploadUrl, /amazonaws\.com/);
    assert.match(target.uploadUrl, /homefix-images/);
    assert.match(target.uploadUrl, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
    assert.match(target.uploadUrl, /X-Amz-Signature=/);
    assert.match(target.uploadUrl, /X-Amz-Expires=900/);

    // The public read URL is the virtual-hosted object URL with a content-typed key.
    assert.equal(
      target.publicUrl,
      `https://homefix-images.s3.ap-northeast-1.amazonaws.com/uploads/${target.id}.png`,
    );
  });

  it('uses a configured public base URL (e.g. a CDN) for reads', async () => {
    const cdn = createS3StorageProvider({
      bucket: 'homefix-images',
      region: 'ap-northeast-1',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret-example',
      publicBaseUrl: 'https://cdn.homefix.example',
      expiresInSeconds: 900,
    });

    const target = await cdn.createUploadTarget({ contentType: 'image/webp' });
    assert.equal(target.publicUrl, `https://cdn.homefix.example/uploads/${target.id}.webp`);
  });
});
