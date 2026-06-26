import * as Location from 'expo-location';

import type {
  DeviceCoordinates,
  LocationProvider,
} from '../../app/src/features/location/currentLocation';

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
