/**
 * Runtime configuration for the HomeFix app.
 *
 * API_BASE_URL points at the HomeFix backend. Set `EXPO_PUBLIC_API_BASE_URL`
 * (e.g. the deployed Railway URL) to override it; Expo inlines `EXPO_PUBLIC_*`
 * vars at build time. It defaults to the local Express server started with
 * `npm run dev` at the repo root. Note an emulator or physical device cannot
 * reach `localhost` on your machine — use your machine's LAN IP (or the deployed
 * URL) there.
 */

const LOCAL_DEFAULT = 'http://localhost:3000';

/**
 * Normalize the configured API base URL so a small deploy typo can't break every
 * request:
 * - unset/empty → the local dev default;
 * - a bare domain (no scheme) gets `https://` prepended — otherwise the browser
 *   can't form an absolute URL from `${base}${path}` and every call fails with
 *   "Could not reach the server" (a real footgun hit during the Railway deploy);
 * - a trailing slash is dropped so paths don't double up.
 */
export function normalizeApiBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return LOCAL_DEFAULT;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
