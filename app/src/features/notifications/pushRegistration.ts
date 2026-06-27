/**
 * Injectable source of this device's push token. The real implementation
 * (app-expo) wraps `expo-notifications` (permission + token); tests pass a fake.
 * Returns null when push is unavailable or permission was denied.
 */
export interface PushTokenProvider {
  getToken(): Promise<string | null>;
}

export type PushRegistrationOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: 'no-token' | 'error' };

/**
 * Obtain the device's push token and hand it to `register` (e.g. the API call).
 * Best-effort: a missing token or a failed registration never throws — push is a
 * nice-to-have, so it must not block sign-in. Returns the outcome for callers
 * that want to log it.
 */
export async function registerForPush(
  provider: PushTokenProvider,
  register: (token: string) => Promise<unknown>,
): Promise<PushRegistrationOutcome> {
  let token: string | null;
  try {
    token = await provider.getToken();
  } catch {
    return { ok: false, reason: 'error' };
  }
  if (token === null || token === '') {
    return { ok: false, reason: 'no-token' };
  }
  try {
    await register(token);
    return { ok: true, token };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
