import { googleStaticMapUrl } from '../../app/src/features/location/mapsLink';
import type { Coordinates } from '../../shared/schemas';

/**
 * A Google Static Maps thumbnail URL for a location, or null when no key is
 * configured. Set `EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY` to a Google Static Maps API
 * key to show a small map preview on the request Location; leave it unset and the
 * UI falls back to the coordinates/address text and the "Open in Maps" link (no
 * broken image). Expo inlines `EXPO_PUBLIC_*` at build time.
 */
export function staticMapPreviewUrl(location: Coordinates): string | null {
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY;
  if (key === undefined || key === '') {
    return null;
  }
  return googleStaticMapUrl(location, key);
}
