import path from 'node:path';
import process from 'node:process';

import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests — the one thing CI has never checked.
 *
 * `npm test` proves the API works and `app-expo` jest proves the components work, but nothing
 * has ever loaded the built web bundle **in a browser**. That gap is not theoretical: a zod
 * 3-vs-4 mismatch once made the exported app throw on boot and render a blank page, and it
 * stayed that way for several slices with CI fully green the whole time — because CI only ever
 * proved the bundle was *produced*, never that it *ran*.
 *
 * So this suite serves the real export from the real server and drives it with a real browser.
 * It is deliberately small: a bundle that boots, a login that round-trips, and a request that
 * is created and comes back. Anything broader belongs in the API tests, which are faster.
 *
 * Run from the repo root, and **build the web bundle first** — this serves `app-expo/dist`, it
 * does not create it:
 *
 *   cd app-expo && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3100 npm run export:web && cd ..
 *   npm run test:e2e
 */

const PORT = '3100';
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The web export the server will serve. Built separately (see above), not by this config. */
const WEB_DIST = path.resolve(process.cwd(), 'app-expo', 'dist');

export default defineConfig({
  testDir: './e2e',
  // A real browser boot plus a Metro-sized bundle is not fast; 30s is generous but not silly.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // The seeded demo accounts are shared mutable state, so the specs must not race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  reporter: process.env['CI'] !== undefined ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    // Keep a trace only when something failed — that is when anyone will actually open it.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node --import tsx server/src/server.ts',
    // `/ready` (not `/health`): it checks the store, so we do not start driving a browser at a
    // server that is up but cannot answer.
    url: `${BASE_URL}/ready`,
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 60_000,
    env: {
      PORT,
      // No DATABASE_URL: the in-memory store is the point — the suite must be hermetic and
      // must never touch a real database. Demo users are seeded so there is something to log
      // in as.
      SEED_DEMO_USERS: 'true',
      WEB_DIST_DIR: WEB_DIST,
      LOG_FORMAT: 'pretty',
    },
  },
});
