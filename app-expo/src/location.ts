import * as Location from 'expo-location';

import type {
  DeviceCoordinates,
  LocationProvider,
} from '../../app/src/features/location/currentLocation';
import type { GeocodeResult, Geocoder } from '../../app/src/features/location/geocoding';

/**
 * The real device location provider, backed by `expo-location`. Asks for
 * foreground permission, then reads the current GPS position. A denied
 * permission throws a friendly message so the form can fall back to manual
 * coordinate entry. Injected into CreateRequestScreen in App.tsx; tests use a
 * fake provider so they never touch the native module.
 */
export const deviceLocationProvider: LocationProvider = {
  async getCurrentPosition(): Promise<DeviceCoordinates> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission denied. Please enter coordinates manually.');
    }
    const position = await Location.getCurrentPositionAsync({});
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
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
