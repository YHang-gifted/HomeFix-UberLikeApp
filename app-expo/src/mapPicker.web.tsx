import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeviceCoordinates } from '../../app/src/features/location/currentLocation';
import type { MapPicker, MapRegion } from '../../app/src/features/location/mapPicker';

// Metro inlines EXPO_PUBLIC_* at build time (dot access required).
const JS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY;

/**
 * Whether the web "Pick on map" flow is usable — i.e. a Maps JavaScript API key is
 * configured. App.tsx uses this to show the button only when the map will work; with
 * no key the picker is inert (react-native-maps is native-only, so web needs the JS
 * SDK instead).
 */
export const mapPickerAvailable: boolean = typeof JS_KEY === 'string' && JS_KEY !== '';

// --- Minimal typings for the slice of the Google Maps JS API we use. Loaded at
// runtime from a <script>, so we avoid a compile-time @types/google.maps dependency. ---
interface GLatLng {
  lat(): number;
  lng(): number;
}
interface GMapMouseEvent {
  latLng: GLatLng | null;
}
interface GMarker {
  setPosition(coords: { lat: number; lng: number }): void;
  addListener(event: string, handler: (event: GMapMouseEvent) => void): void;
}
interface GMap {
  addListener(event: string, handler: (event: GMapMouseEvent) => void): void;
}
interface GoogleMapsApi {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => GMap;
  Marker: new (options: Record<string, unknown>) => GMarker;
}

function mapsApi(): GoogleMapsApi | null {
  const holder = globalThis as unknown as { google?: { maps?: GoogleMapsApi } };
  return holder.google?.maps ?? null;
}

// Load the Google Maps JS SDK once; the promise is cached so repeated opens reuse it.
let sdkPromise: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (mapsApi() !== null) {
    return Promise.resolve();
  }
  if (sdkPromise !== null) {
    return sdkPromise;
  }
  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(JS_KEY ?? '')}`;
    script.async = true;
    script.addEventListener('load', () => {
      resolve();
    });
    script.addEventListener('error', () => {
      sdkPromise = null; // allow a later retry
      reject(new Error('Failed to load Google Maps'));
    });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// Bridge between the imperative MapPicker promise (called from CreateRequestScreen)
// and the declarative <MapPickerHost/> modal mounted once at the app root.
let openHost: ((initial: MapRegion) => Promise<DeviceCoordinates | null>) | null = null;

/**
 * The web map picker, backed by the Google Maps JavaScript SDK. Resolves with the
 * chosen coordinates (dragged pin or a tap on the map), or null if cancelled / no
 * host is mounted / no key is configured. Injected into CreateRequestScreen in App.tsx.
 */
export const deviceMapPicker: MapPicker = (initial) =>
  openHost === null ? Promise.resolve(null) : openHost(initial);

/** Mount once at the app root so {@link deviceMapPicker} has a modal to drive. */
export function MapPickerHost(): ReactElement | null {
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [pin, setPin] = useState<DeviceCoordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resolverRef = useRef<((coords: DeviceCoordinates | null) => void) | null>(null);
  const containerRef = useRef<View | null>(null);
  const pinRef = useRef<DeviceCoordinates | null>(null);

  const open = useCallback((initial: MapRegion): Promise<DeviceCoordinates | null> => {
    const start: DeviceCoordinates = { latitude: initial.latitude, longitude: initial.longitude };
    pinRef.current = start;
    setPin(start);
    setError(null);
    setLoading(true);
    setRegion(initial);
    return new Promise<DeviceCoordinates | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!mapPickerAvailable) {
      return undefined;
    }
    openHost = open;
    return () => {
      openHost = null;
    };
  }, [open]);

  function updatePin(coords: DeviceCoordinates): void {
    pinRef.current = coords;
    setPin(coords);
  }

  function finish(coords: DeviceCoordinates | null): void {
    resolverRef.current?.(coords);
    resolverRef.current = null;
    setRegion(null);
    setPin(null);
    pinRef.current = null;
    setError(null);
    setLoading(false);
  }

  // Build the map + draggable marker once the modal is shown for a region.
  useEffect(() => {
    if (region === null) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        await loadSdk();
        const api = mapsApi();
        const node = containerRef.current as unknown as HTMLElement | null;
        if (cancelled) {
          return;
        }
        if (api === null || node === null) {
          setError('The map could not be loaded.');
          setLoading(false);
          return;
        }
        const map = new api.Map(node, {
          center: { lat: region.latitude, lng: region.longitude },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
        });
        const marker = new api.Marker({
          map,
          position: { lat: region.latitude, lng: region.longitude },
          draggable: true,
        });
        marker.addListener('dragend', (event) => {
          if (event.latLng !== null) {
            updatePin({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
          }
        });
        map.addListener('click', (event) => {
          if (event.latLng !== null) {
            const coords: DeviceCoordinates = {
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            };
            marker.setPosition({ lat: coords.latitude, lng: coords.longitude });
            updatePin(coords);
          }
        });
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('The map could not be loaded.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [region]);

  if (!mapPickerAvailable) {
    return null;
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
          <View ref={containerRef} style={styles.map} />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator />
            </View>
          )}
          {error !== null && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.hint}>Drag the pin or tap the map to set the exact spot.</Text>
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
                finish(pinRef.current);
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 13,
    color: '#334155',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
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
