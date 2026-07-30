import Constants from 'expo-constants';
import { type ComponentType, type ReactElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { LiveMapProps } from '../../app/src/features/tracking/liveMap';

/**
 * Renders an interactive map of the worker moving toward the job site (live-tracking Phase 2b).
 * Injected into RequestDetailScreen so tests and the web build can omit it and fall back to the
 * static map thumbnail. The React-dependent type lives here (not in the shared `app` package, which
 * has no React) alongside its only real implementation. See `docs/live-tracking.md`.
 */
export type LiveMapView = ComponentType<LiveMapProps>;

/**
 * Whether a map will actually render — **per platform**, mirroring the map picker's gate.
 *
 * - **iOS** falls back to Apple Maps, so it needs no key and always works.
 * - **Android** uses Google Maps and, with no API key, renders a blank grey square. Showing that as
 *   a "live location" would be worse than nothing, so on Android the live map is offered only when
 *   the key is configured (published by `app.config.ts`; the caller falls back to the static
 *   thumbnail otherwise).
 */
const androidMapsConfigured = Constants.expoConfig?.extra?.['androidMapsConfigured'] === true;

export const liveMapAvailable: boolean = Platform.OS === 'ios' ? true : androidMapsConfigured;

/** How far around the worker to show; small enough to feel "live", wide enough to keep context. */
const REGION_DELTA = 0.02;

/**
 * The real device live map, backed by `react-native-maps`: a marker for the worker (recentred as
 * they move) and a marker for the job site. Injected into RequestDetailScreen in App.tsx; native
 * only, so tests supply a fake. See `docs/live-tracking.md`.
 */
export function deviceLiveMap({ worker, destination }: LiveMapProps): ReactElement {
  return (
    <MapView
      style={styles.map}
      region={{
        latitude: worker.latitude,
        longitude: worker.longitude,
        latitudeDelta: REGION_DELTA,
        longitudeDelta: REGION_DELTA,
      }}
      pointerEvents="none"
    >
      <Marker coordinate={worker} title="Your worker" pinColor="#2563eb" />
      <Marker coordinate={destination} title="Job site" pinColor="#16a34a" />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 180, borderRadius: 12 },
});
