import type { Buffer } from 'node:buffer';

/** A stored upload's bytes and content type. */
export interface StoredUpload {
  contentType: string;
  data: Buffer;
}

/**
 * In-memory image store for the mock upload provider (dev/test). Bytes live only
 * for the process lifetime; a real deployment configures an object-storage
 * provider instead.
 */
export class InMemoryUploadStore {
  private readonly uploads = new Map<string, StoredUpload>();

  public put(id: string, contentType: string, data: Buffer): void {
    this.uploads.set(id, { contentType, data });
  }

  public get(id: string): StoredUpload | undefined {
    return this.uploads.get(id);
  }

  public clear(): void {
    this.uploads.clear();
  }
}

export const uploadStore = new InMemoryUploadStore();
