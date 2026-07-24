import type { DeviceCoordinates } from './currentLocation';

/** A map viewport: a center plus how much area (in degrees) it spans. */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Injectable map picker. Opens a map centered on `initial`, lets the user drop a
 * pin, and resolves with the chosen coordinates (or null if they cancel). The real
 * implementation (app-expo) wraps `react-native-maps`; tests pass a fake, keeping
 * the native map dependency out of the tested logic layer.
 */
export type MapPicker = (initial: MapRegion) => Promise<DeviceCoordinates | null>;

// Centered on the geographic center of the contiguous US when the form has no usable coordinates
// yet — HomeFix is a US-market product (the TWD→USD pivot, slice 172), so the old Taipei default
// no longer fits.
const DEFAULT_CENTER: DeviceCoordinates = { latitude: 39.8283, longitude: -98.5795 };
const DEFAULT_DELTA = 0.02;

/**
 * Derive the region the map should open at from the form's current latitude /
 * longitude strings. Invalid or out-of-range values fall back to a default center,
 * so the map always opens somewhere sensible.
 */
export function initialMapRegion(latitude: string, longitude: string): MapRegion {
  const lat = Number.parseFloat(latitude);
  const lng = Number.parseFloat(longitude);
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  return {
    latitude: validLat ? lat : DEFAULT_CENTER.latitude,
    longitude: validLng ? lng : DEFAULT_CENTER.longitude,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };
}
