import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import type { PushTokenProvider } from '../../app/src/features/notifications/pushRegistration';

/**
 * The EAS project id, which `getExpoPushTokenAsync` needs to mint a token.
 *
 * Read defensively: `expoConfig.extra` is untyped, and this is exactly the value that was
 * missing. `eas init` writes it into `extra.eas.projectId`.
 */
function easProjectId(): string | undefined {
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== 'object' || extra === null) {
    return undefined;
  }
  const eas: unknown = (extra as Record<string, unknown>)['eas'];
  if (typeof eas !== 'object' || eas === null) {
    return undefined;
  }
  const projectId: unknown = (eas as Record<string, unknown>)['projectId'];
  return typeof projectId === 'string' && projectId !== '' ? projectId : undefined;
}

/**
 * The real push-token provider, backed by `expo-notifications`. Ensures notification permission
 * (requesting it once if needed), then reads the Expo push token. Returns null when permission
 * is denied, so push registration is simply skipped — it must never block sign-in. Injected in
 * App.tsx after a session is established; tests use a fake provider.
 *
 * **The `projectId` is passed explicitly, and its absence is a loud error.** Until now the call
 * was `getExpoPushTokenAsync()` with no argument, and `app.json` carried no `extra` block — so
 * the library found no project id from any of its three sources and threw on **every device,
 * every time**. The caller swallowed it. Push was not "unreliable": it had never worked once,
 * and nothing in the app, the tests, or the logs would have told you. Letting the library raise
 * its own opaque `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID` here would repeat that; say what is wrong
 * and what to do about it instead.
 */
export const devicePushTokenProvider: PushTokenProvider = {
  async getToken(): Promise<string | null> {
    const projectId = easProjectId();
    if (projectId === undefined) {
      throw new Error(
        'Push is not configured: no EAS projectId in the app config. Run `eas init` in app-expo/.',
      );
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  },
};
