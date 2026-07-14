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
  | { ok: false; reason: 'no-token' | 'error'; detail?: string };

/**
 * Obtain the device's push token and hand it to `register` (e.g. the API call).
 * Best-effort: a missing token or a failed registration never throws — push is a
 * nice-to-have, so it must not block sign-in. Returns the outcome for callers
 * that want to log it.
 *
 * `detail` carries **why** it failed. Without it this was a perfect silence: the token call
 * threw (it always did — no EAS `projectId` was configured, so `getExpoPushTokenAsync` could
 * not succeed on any device, ever), the `catch` discarded the error, and the caller discarded
 * the outcome. Push simply never worked and nothing anywhere said so. Swallowing the failure
 * is right — push must not block sign-in — but swallowing the *evidence* is how a feature
 * stays broken for a year.
 */
export async function registerForPush(
  provider: PushTokenProvider,
  register: (token: string) => Promise<unknown>,
): Promise<PushRegistrationOutcome> {
  let token: string | null;
  try {
    token = await provider.getToken();
  } catch (failure) {
    return { ok: false, reason: 'error', detail: describe(failure) };
  }
  if (token === null || token === '') {
    return { ok: false, reason: 'no-token' };
  }
  try {
    await register(token);
    return { ok: true, token };
  } catch (failure) {
    return { ok: false, reason: 'error', detail: describe(failure) };
  }
}

function describe(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Unknown error';
}
