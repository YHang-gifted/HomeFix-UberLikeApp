import type { ReactElement } from 'react';

import type { MapPicker } from '../../app/src/features/location/mapPicker';

// react-native-maps is native-only, so on web the picker is inert and the host
// renders nothing. App.tsx additionally hides the "Pick on map" button on web
// (Platform.OS === 'web'); this stub keeps the native module out of the web bundle.
export const deviceMapPicker: MapPicker = () => Promise.resolve(null);

export function MapPickerHost(): ReactElement | null {
  return null;
}
