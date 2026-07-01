import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { UploadTarget } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';

/** What a storage provider needs to open an upload slot for one image. */
export interface CreateUploadTargetInput {
  /** The image MIME type the client will PUT (validated at the boundary). */
  contentType: string;
}

/**
 * The seam a real object-storage provider (S3 / GCS / R2 …) slots into. The mock
 * provider stores bytes on our own API; a real adapter returns a presigned PUT
 * URL (the client uploads the bytes directly) plus the object's public read URL.
 * Async because presigning is an async operation.
 */
export interface StorageProvider {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>;
}

/** File extension for each allowed image type, used to build the object key. */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * The default, inert provider. It hands back URLs on our own API (relative to the
 * API base — the client resolves them); the bytes are PUT back to us and served
 * from an in-memory store. It contacts nothing external, honoring the project rule
 * against provider-side production actions.
 */
export const mockStorageProvider: StorageProvider = {
  createUploadTarget(_input: CreateUploadTargetInput): Promise<UploadTarget> {
    const id = randomUUID();
    const path = `/uploads/${id}`;
    return Promise.resolve({ id, uploadUrl: path, publicUrl: path });
  },
};

/** Resolved configuration for the real S3 storage provider. */
export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public read base (CDN or bucket URL). Defaults to the virtual-hosted S3 URL. */
  publicBaseUrl?: string;
  /** Custom endpoint for S3-compatible storage (R2, MinIO). */
  endpoint?: string;
  expiresInSeconds: number;
}

/**
 * A real object-storage provider backed by Amazon S3 (or an S3-compatible store).
 * `createUploadTarget` presigns a PUT so the client uploads the image bytes
 * directly to the bucket; the returned `publicUrl` is where the stored object is
 * read. Nothing is uploaded here — only a URL is signed — so this makes no
 * network call and moves no data on its own.
 */
export function createS3StorageProvider(config: S3StorageConfig): StorageProvider {
  const client = new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
  });
  const publicBase = (
    config.publicBaseUrl ?? `https://${config.bucket}.s3.${config.region}.amazonaws.com`
  ).replace(/\/$/, '');

  return {
    async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
      const id = randomUUID();
      const key = `uploads/${id}.${EXTENSIONS[input.contentType] ?? 'bin'}`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: input.contentType,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: config.expiresInSeconds,
      });
      return { id, uploadUrl, publicUrl: `${publicBase}/${key}` };
    },
  };
}

/** Build the S3 config from the environment, or undefined when it isn't fully set. */
export function s3ConfigFromEnv(env: Env): S3StorageConfig | undefined {
  const { STORAGE_S3_BUCKET, STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID } = env;
  const secret = env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!STORAGE_S3_BUCKET || !STORAGE_S3_REGION || !STORAGE_S3_ACCESS_KEY_ID || !secret) {
    return undefined;
  }
  return {
    bucket: STORAGE_S3_BUCKET,
    region: STORAGE_S3_REGION,
    accessKeyId: STORAGE_S3_ACCESS_KEY_ID,
    secretAccessKey: secret,
    ...(env.STORAGE_S3_PUBLIC_BASE_URL !== undefined
      ? { publicBaseUrl: env.STORAGE_S3_PUBLIC_BASE_URL }
      : {}),
    ...(env.STORAGE_S3_ENDPOINT !== undefined ? { endpoint: env.STORAGE_S3_ENDPOINT } : {}),
    expiresInSeconds: env.STORAGE_S3_UPLOAD_EXPIRES_SECONDS,
  };
}

/**
 * Choose the storage provider from configuration: real S3 when a bucket, region,
 * and credentials are all set; otherwise the inert mock. Keeping the upload flow
 * provider-agnostic, callers never change.
 */
export function selectStorageProvider(env: Env = loadEnv()): StorageProvider {
  const s3 = s3ConfigFromEnv(env);
  return s3 ? createS3StorageProvider(s3) : mockStorageProvider;
}

export const storageProvider: StorageProvider = selectStorageProvider();
