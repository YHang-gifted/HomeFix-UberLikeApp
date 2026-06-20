/**
 * Runtime configuration for the HomeFix app.
 *
 * API_BASE_URL points at the HomeFix backend. For local development this is the
 * Express server started with `npm run dev` at the repo root. Override per
 * environment/device as needed (an emulator or physical device cannot reach
 * `localhost` on your machine — use your machine's LAN IP there).
 */
export const API_BASE_URL = 'http://localhost:3000';
