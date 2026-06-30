import * as ExpoImagePicker from 'expo-image-picker';

import type { ImagePicker, PickedImage } from '../../app/src/features/uploads/uploadImage';
import { imageContentTypeSchema } from '../../shared/schemas';

/**
 * The real device image picker, backed by `expo-image-picker`. Asks for photo
 * library permission, lets the user pick an image, then reads its bytes as a
 * blob for upload. A non-JPEG/PNG/WEBP asset falls back to image/jpeg. Returns
 * null when the user cancels. Injected into CreateRequestScreen in App.tsx; tests
 * use a fake picker so they never touch the native module.
 */
export const deviceImagePicker: ImagePicker = async (): Promise<PickedImage | null> => {
  const permission = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission denied.');
  }

  const result = await ExpoImagePicker.launchImageLibraryAsync({
    mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });
  if (result.canceled) {
    return null;
  }
  const asset = result.assets[0];
  if (asset === undefined) {
    return null;
  }

  const parsed = imageContentTypeSchema.safeParse(asset.mimeType);
  const contentType = parsed.success ? parsed.data : 'image/jpeg';
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return { blob, contentType };
};
