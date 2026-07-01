import type { Buffer } from 'node:buffer';

import type { UploadTarget } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { uploadStore } from '../repositories/uploadStore.ts';
import type { StoredUpload } from '../repositories/uploadStore.ts';
import { storageProvider } from './storageProvider.ts';
import type { CreateUploadTargetInput } from './storageProvider.ts';

/**
 * Create an upload target via the configured storage provider. The mock provider
 * hands back URLs on our own API (relative to the API base — the client resolves
 * them); a real provider returns a presigned object-storage URL instead.
 */
export function createUploadTarget(input: CreateUploadTargetInput): UploadTarget {
  return storageProvider.createUploadTarget(input);
}

/** Store the uploaded bytes for an id (mock provider). */
export function storeUpload(id: string, contentType: string, data: Buffer): void {
  uploadStore.put(id, contentType, data);
}

/** Fetch a stored upload's bytes, or 404 if it does not exist. */
export function getUpload(id: string): StoredUpload {
  const found = uploadStore.get(id);
  if (!found) {
    throw new AppError('Upload not found', 404);
  }
  return found;
}

export function resetUploads(): void {
  uploadStore.clear();
}
