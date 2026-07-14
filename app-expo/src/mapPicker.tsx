import Constants from 'expo-constants';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { DeviceCoordinates } from '../../app/src/features/location/currentLocation';
import type { MapPicker, MapRegion } from '../../app/src/features/location/mapPicker';

// Bridge between the imperative MapPicker promise (called from CreateRequestScreen)
// and the declarative <MapPickerHost/> modal that must be mounted once at the app
// root. The host registers its open function here while mounted.
let openHost: ((initial: MapRegion) => Promise<DeviceCoordinates | null>) | null = null;

/**
 * The real device map picker, backed by `react-native-maps`. Opens the mounted
 * host modal centered on the initial region and resolves with the dropped-pin
 * coordinates (or null if cancelled / no host is mounted). Injected into
 * CreateRequestScreen in App.tsx; native-only, so tests use a fake.
 */
export const deviceMapPicker: MapPicker = (initial) => {
  return openHost === null ? Promise.resolve(null) : openHost(initial);
};

/**
 * Whether a map will actually render — **per platform**, because the two do not behave alike.
 *
 * - **iOS** falls back to Apple Maps, so it needs no key and always works.
 * - **Android** uses Google Maps and, with no API key, **fails silently**: not an error, not a
 *   warning, just a **blank grey square with a draggable pin**. A user would drag a marker
 *   across nothing and submit a location they never saw — worse than having no map button at
 *   all. So on Android the picker is offered only when the key is configured.
 *
 * `androidMapsConfigured` is published by `app.config.ts`, which is where the key is read from
 * the environment (it must not be committed). This mirrors the web module, which has always
 * gated on its own key; native was the one that claimed to be unconditionally available.
 */
const androidMapsConfigured = Constants.expoConfig?.extra?.['androidMapsConfigured'] === true;

export const mapPickerAvailable: boolean = Platform.OS === 'ios' ? true : androidMapsConfigured;

/** Mount once at the app root so {@link deviceMapPicker} has a modal to drive. */
export function MapPickerHost(): ReactElement {
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [pin, setPin] = useState<DeviceCoordinates | null>(null);
  const [resolver, setResolver] = useState<((coords: DeviceCoordinates | null) => void) | null>(
    null,
  );

  const open = useCallback((initial: MapRegion): Promise<DeviceCoordinates | null> => {
    setRegion(initial);
    setPin({ latitude: initial.latitude, longitude: initial.longitude });
    return new Promise<DeviceCoordinates | null>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  useEffect(() => {
    openHost = open;
    return () => {
      openHost = null;
    };
  }, [open]);

  function finish(coords: DeviceCoordinates | null): void {
    resolver?.(coords);
    setResolver(null);
    setRegion(null);
    setPin(null);
  }

  return (
    <Modal
      visible={region !== null}
      animationType="slide"
      onRequestClose={() => {
        finish(null);
      }}
    >
      {region !== null && (
        <View style={styles.container}>
          <MapView
            style={styles.map}
            initialRegion={region}
            onPress={(event) => {
              setPin(event.nativeEvent.coordinate);
            }}
          >
            {pin !== null && (
              <Marker
                draggable
                coordinate={pin}
                onDragEnd={(event) => {
                  setPin(event.nativeEvent.coordinate);
                }}
              />
            )}
          </MapView>
          <View style={styles.actions}>
            <Pressable
              style={styles.cancel}
              onPress={() => {
                finish(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Cancel map pick"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, pin === null && styles.confirmDisabled]}
              onPress={() => {
                finish(pin);
              }}
              disabled={pin === null}
              accessibilityRole="button"
              accessibilityLabel="Use this location"
            >
              <Text style={styles.confirmText}>Use this location</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  map: { flex: 1 },
  actions: { flexDirection: 'row', gap: 12, padding: 16 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  confirm: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDisabled: { backgroundColor: '#93c5fd' },
  confirmText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
