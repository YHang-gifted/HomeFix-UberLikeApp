import * as Location from 'expo-location';

import type { BackgroundTracker } from '../../app/src/features/tracking/backgroundTracker';
import { apiClient } from './api';

// The real device tracker for live-tracking the worker on the way to a visit. For now it
// FOREGROUND-watches the position (as `deviceLocationWatcher` used to) and POSTs each fix to the
// request's live-location endpoint; a later slice swaps the internals to a background TaskManager
// task so streaming survives the app being backgrounded, without changing this seam. A denied
// permission is a silent no-op (the caller never has to special-case it).

let subscription: Location.LocationSubscription | null = null;

function stopWatching(): void {
  if (subscription !== null) {
    subscription.remove();
    subscription = null;
  }
}

export const deviceBackgroundTracker: BackgroundTracker = {
  async start(requestId: string): Promise<void> {
    // Never run two watches at once (a re-render or a re-`start` must not double-report).
    stopWatching();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 25 },
      (position) => {
        void apiClient
          .publishLocation(requestId, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
          .catch(() => undefined);
      },
    );
  },
  async stop(): Promise<void> {
    stopWatching();
  },
};
