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

/**
 * A Google Static Maps thumbnail URL for a coordinate, given an API key: a small
 * roadmap image centered on the point with a brand-colored marker. Pure and
 * testable; the app supplies the key from config (and omits the thumbnail when no
 * key is set). Used as a lightweight preview that opens the interactive map (see
 * {@link mapsUrl}) when tapped.
 */
export function googleStaticMapUrl(location: Coordinates, apiKey: string): string {
  const center = `${String(location.latitude)},${String(location.longitude)}`;
  const params = new URLSearchParams({
    center,
    zoom: '15',
    size: '600x300',
    scale: '2',
    markers: `color:0x167A5A|${center}`,
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
