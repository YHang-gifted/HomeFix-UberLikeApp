import { randomUUID } from 'node:crypto';

import type { UploadTarget } from '../../../shared/schemas.ts';

/** What a storage provider needs to open an upload slot for one image. */
export interface CreateUploadTargetInput {
  /** The image MIME type the client will PUT (validated at the boundary). */
  contentType: string;
}

/**
 * The seam a real object-storage provider (S3 / GCS / R2 …) slots into. The mock
 * provider stores bytes on our own API; a real adapter returns a presigned PUT
 * URL (the client uploads the bytes directly) plus the object's public read URL.
 */
export interface StorageProvider {
  createUploadTarget(input: CreateUploadTargetInput): UploadTarget;
}

/**
 * The default, inert provider. It hands back URLs on our own API (relative to the
 * API base — the client resolves them); the bytes are PUT back to us and served
 * from an in-memory store. It contacts nothing external, honoring the project rule
 * against provider-side production actions. A real provider is config-gated and
 * swapped in at {@link selectStorageProvider} without touching callers.
 */
export const mockStorageProvider: StorageProvider = {
  createUploadTarget(_input: CreateUploadTargetInput): UploadTarget {
    const id = randomUUID();
    const path = `/uploads/${id}`;
    return { id, uploadUrl: path, publicUrl: path };
  },
};

/**
 * Choose the storage provider. Only the inert mock exists today; a real provider
 * would be selected here from configuration (e.g. an S3 bucket + credentials),
 * keeping the upload flow provider-agnostic.
 */
export function selectStorageProvider(): StorageProvider {
  return mockStorageProvider;
}

export const storageProvider: StorageProvider = selectStorageProvider();
