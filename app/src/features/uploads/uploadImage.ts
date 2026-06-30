import type { ApiClient } from '../../services/apiClient';
import type { ImageContentType } from '../../../../shared/schemas';

/** An image chosen by the user, ready to upload. */
export interface PickedImage {
  blob: Blob;
  contentType: ImageContentType;
}

/**
 * Picks an image from the device (or returns null if the user cancels). The
 * concrete picker (e.g. expo-image-picker) is injected by the app so the screens
 * and this logic stay testable and platform-agnostic.
 */
export type ImagePicker = () => Promise<PickedImage | null>;

/**
 * Upload a picked image via the API and return its absolute public URL, suitable
 * for storing in a request's photoUrls. Requests an upload target, PUTs the
 * bytes, then resolves the returned public path against the API base.
 */
export async function uploadPickedImage(client: ApiClient, picked: PickedImage): Promise<string> {
  const target = await client.createUpload(picked.contentType);
  await client.putUploadBytes(target.uploadUrl, picked.contentType, picked.blob);
  return client.resolveUrl(target.publicUrl);
}
