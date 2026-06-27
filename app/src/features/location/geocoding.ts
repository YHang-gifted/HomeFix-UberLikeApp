/** One geocoding match: a coordinate plus a human-readable label. */
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

/**
 * Injectable address→coordinates lookup. The real implementation (app-expo)
 * wraps a geocoding provider/SDK; tests pass a fake. Keeping this an interface
 * keeps the network/native dependency out of the tested logic layer.
 */
export interface Geocoder {
  geocode(query: string): Promise<GeocodeResult[]>;
}

const MIN_QUERY_LENGTH = 3;

export type GeocodeOutcome =
  | { ok: true; results: GeocodeResult[] }
  | { ok: false; message: string };

/**
 * Look up an address string and return the matching coordinates. Validates the
 * query, maps an empty result set and any provider error to a friendly message,
 * so the caller can show it and fall back to manual entry.
 */
export async function searchAddress(geocoder: Geocoder, query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { ok: false, message: 'Enter at least 3 characters to search.' };
  }
  try {
    const results = await geocoder.geocode(trimmed);
    if (results.length === 0) {
      return { ok: false, message: 'No matching places found. Try a different address.' };
    }
    return { ok: true, results };
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Could not search for that address. Please try again or enter coordinates manually.';
    return { ok: false, message };
  }
}

/** Format a chosen result into the string values the create-request form uses. */
export function resultToCoordinateStrings(result: GeocodeResult): {
  latitude: string;
  longitude: string;
} {
  return {
    latitude: result.latitude.toFixed(6),
    longitude: result.longitude.toFixed(6),
  };
}
