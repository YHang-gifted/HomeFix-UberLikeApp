import type { Coordinates } from '../../../../shared/schemas';

/**
 * A universal Google Maps link for a coordinate. Works cross-platform: on the web
 * it opens maps in the browser, and on mobile the OS routes it to the Maps app.
 * The coordinates are the canonical location value; this is only for display/open.
 */
export function mapsUrl(location: Coordinates): string {
  const query = `${String(location.latitude)},${String(location.longitude)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
