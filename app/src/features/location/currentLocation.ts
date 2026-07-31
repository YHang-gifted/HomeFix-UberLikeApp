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

/**
 * The raw device primitives the real provider wires to `expo-location`. Injectable so the
 * orchestration below (permission → instant last-known → time-bounded fresh read) is unit-tested
 * without the native module.
 */
export interface RawPositionSource {
  requestPermission(): Promise<boolean>;
  getLastKnownPosition(): Promise<DeviceCoordinates | null>;
  getCurrentPosition(): Promise<DeviceCoordinates>;
}

/** Default cap on how long a fresh GPS read may take before we give up and ask for manual entry. */
export const CURRENT_LOCATION_TIMEOUT_MS = 15_000;

/** Reject with `message` if `promise` has not settled within `ms` — so a stalled read never hangs. */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolve the device position without ever hanging: require permission, then prefer an instant
 * last-known fix (which also succeeds on emulators, where a fresh fix may never arrive), and only
 * otherwise take a fresh read bounded by a timeout. Pure orchestration over injected primitives, so
 * the "spinner forever" failure mode is impossible — and unit-testable. A denied permission or a
 * timeout throws a friendly message that {@link fetchCurrentLocation} surfaces for manual entry.
 */
export async function resolveDevicePosition(
  source: RawPositionSource,
  timeoutMs: number = CURRENT_LOCATION_TIMEOUT_MS,
): Promise<DeviceCoordinates> {
  const granted = await source.requestPermission();
  if (!granted) {
    throw new Error('Location permission denied. Please enter coordinates manually.');
  }
  const lastKnown = await source.getLastKnownPosition();
  if (lastKnown !== null) {
    return lastKnown;
  }
  return withTimeout(
    source.getCurrentPosition(),
    timeoutMs,
    'Could not get your location in time. Please enter coordinates manually.',
  );
}
