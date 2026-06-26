/** A latitude/longitude pair as reported by a device, in decimal degrees. */
export interface DeviceCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Injectable source of the device's current position. The real implementation
 * (app-expo) wraps `expo-location`; tests pass a fake. Keeping this an interface
 * keeps the geolocation native dependency out of the tested logic layer.
 */
export interface LocationProvider {
  getCurrentPosition(): Promise<DeviceCoordinates>;
}

/** Format raw coordinates into the string values the create-request form uses. */
export function toCoordinateStrings(coords: DeviceCoordinates): {
  latitude: string;
  longitude: string;
} {
  return {
    latitude: coords.latitude.toFixed(6),
    longitude: coords.longitude.toFixed(6),
  };
}

export type LocationOutcome =
  | { ok: true; latitude: string; longitude: string }
  | { ok: false; message: string };

/**
 * Resolve the device's current location into form-ready coordinate strings.
 * Any failure (permission denied, GPS off, timeout) is mapped to a friendly
 * message so the caller can show it and fall back to manual entry.
 */
export async function fetchCurrentLocation(provider: LocationProvider): Promise<LocationOutcome> {
  try {
    const coords = await provider.getCurrentPosition();
    const { latitude, longitude } = toCoordinateStrings(coords);
    return { ok: true, latitude, longitude };
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Could not get your location. Please enter it manually.';
    return { ok: false, message };
  }
}
