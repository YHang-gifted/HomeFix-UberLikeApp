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
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
