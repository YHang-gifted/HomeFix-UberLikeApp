import * as Notifications from 'expo-notifications';

import type { PushTokenProvider } from '../../app/src/features/notifications/pushRegistration';

/**
 * The real push-token provider, backed by `expo-notifications`. Ensures
 * notification permission (requesting it once if needed), then reads the Expo
 * push token. Returns null when permission is denied or a token cannot be
 * obtained, so push registration is simply skipped — it must never block sign-in.
 * Injected in App.tsx after a session is established; tests use a fake provider.
 */
export const devicePushTokenProvider: PushTokenProvider = {
  async getToken(): Promise<string | null> {
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      return null;
    }
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data;
  },
};
