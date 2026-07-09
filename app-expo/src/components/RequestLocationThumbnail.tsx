import { type ReactElement } from 'react';
import { Image, StyleSheet } from 'react-native';

import type { Coordinates } from '../../../shared/schemas';
import { staticMapPreviewUrl } from '../staticMap';
import { colors, radii } from '../theme';

export interface RequestLocationThumbnailProps {
  /** The request's coordinates. */
  location: Coordinates;
  /**
   * Builds the static-map thumbnail URL, or null when none is configured (no API
   * key). Injected for tests; defaults to the real Google Static Maps preview.
   */
  mapPreviewUrl?: (location: Coordinates) => string | null;
}

/**
 * A small static map thumbnail for a request's location, shown on list cards.
 * Renders nothing when no Static Maps key is configured (the URL builder returns
 * null), so lists stay clean until the key is set — never a broken image. The
 * enclosing card handles the tap (it opens the detail screen with the interactive
 * map), so this is a plain, non-interactive image.
 */
export function RequestLocationThumbnail({
  location,
  mapPreviewUrl = staticMapPreviewUrl,
}: RequestLocationThumbnailProps): ReactElement | null {
  const uri = mapPreviewUrl(location);
  if (uri === null) {
    return null;
  }
  return (
    <Image
      source={{ uri }}
      style={styles.thumbnail}
      resizeMode="cover"
      accessibilityLabel="Location map preview"
    />
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: '100%',
    height: 120,
    borderRadius: radii.medium,
    marginTop: 10,
    backgroundColor: colors.canvas,
  },
});
