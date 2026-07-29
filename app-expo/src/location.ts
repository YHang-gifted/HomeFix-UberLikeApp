import * as Location from 'expo-location';

import type {
  DeviceCoordinates,
  LocationProvider,
  LocationWatcher,
} from '../../app/src/features/location/currentLocation';
import { resolveDevicePosition } from '../../app/src/features/location/currentLocation';
import type { GeocodeResult, Geocoder } from '../../app/src/features/location/geocoding';

/**
 * The real device location provider, backed by `expo-location`. It asks for foreground permission,
 * prefers an instant last-known fix, and only otherwise takes a fresh read — bounded by a timeout so
 * the UI can never spin forever when the platform has no signal (e.g. an emulator with no fresh
 * fix). A denied permission or a timeout throws a friendly message so the form falls back to manual
 * entry. The orchestration lives in `resolveDevicePosition` (tested); this only wires the native
 * primitives. Injected into CreateRequestScreen in App.tsx; tests use a fake provider.
 */
export const deviceLocationProvider: LocationProvider = {
  getCurrentPosition(): Promise<DeviceCoordinates> {
    return resolveDevicePosition({
      async requestPermission(): Promise<boolean> {
        const { status } = await Location.requestForegroundPermissionsAsync();
        return status === 'granted';
      },
      async getLastKnownPosition(): Promise<DeviceCoordinates | null> {
        const position = await Location.getLastKnownPositionAsync();
        return position === null
          ? null
          : { latitude: position.coords.latitude, longitude: position.coords.longitude };
      },
      async getCurrentPosition(): Promise<DeviceCoordinates> {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return { latitude: position.coords.latitude, longitude: position.coords.longitude };
      },
    });
  },
};

/**
 * The real foreground location stream, backed by `expo-location`'s `watchPositionAsync`. Used to
 * live-track the assigned worker on the way to a visit (Phase 2). Foreground only — it runs while
 * the app is open on the request screen; no background permission. A denied permission yields a
 * no-op stream (the stop function still resolves) so the caller never has to special-case it.
 */
export const deviceLocationWatcher: LocationWatcher = {
  async watch(onUpdate: (coords: DeviceCoordinates) => void): Promise<() => void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return () => undefined;
    }
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 25 },
      (position) => {
        onUpdate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
    );
    return () => {
      subscription.remove();
    };
  },
};

/**
 * The real address geocoder, backed by `expo-location`'s forward geocoding.
 * Returns the matching coordinates for a typed address; each match is labelled
 * with the query (suffixed when there are several). Geocoding availability and
 * accuracy depend on the platform/provider configuration, so failures and empty
 * results are surfaced by the logic layer as a friendly message. Injected into
 * CreateRequestScreen in App.tsx; tests use a fake geocoder.
 */
export const deviceGeocoder: Geocoder = {
  async geocode(query: string): Promise<GeocodeResult[]> {
    const matches = await Location.geocodeAsync(query);
    return matches.map((match, index) => ({
      latitude: match.latitude,
      longitude: match.longitude,
      label: matches.length > 1 ? `${query} (${String(index + 1)})` : query,
    }));
  },
};
