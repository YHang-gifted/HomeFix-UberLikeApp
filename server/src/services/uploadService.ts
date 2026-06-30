import { randomUUID } from 'node:crypto';
import type { Buffer } from 'node:buffer';

import type { UploadTarget } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { uploadStore } from '../repositories/uploadStore.ts';
import type { StoredUpload } from '../repositories/uploadStore.ts';

/**
 * Create an upload target. The mock provider hands back URLs on our own API
 * (relative to the API base — the client resolves them); a configured provider
 * would return a presigned object-storage URL instead.
 */
export function createUploadTarget(): UploadTarget {
  const id = randomUUID();
  const path = `/uploads/${id}`;
  return { id, uploadUrl: path, publicUrl: path };
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
