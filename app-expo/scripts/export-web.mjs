// One-shot static web build: mirror the shared code into ./.shared, then run
// `expo export -p web` with the mirror enabled (HOMEFIX_WEB_EXPORT=1, read by
// metro.config.js). Setting the flag here — not in the package.json script —
// keeps it cross-platform and ensures the dev server (`npm run web`) never sees
// it. Output: ./dist (a static site that points at EXPO_PUBLIC_API_BASE_URL).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mirror = path.resolve(scriptDir, '..', '.shared');

try {
  execSync(`node "${path.join(scriptDir, 'sync-shared.mjs')}"`, { stdio: 'inherit' });
  // `--clear` resets Metro's transform/resolution cache so a config or dependency
  // change (e.g. the resolved `zod` version) is always reflected in the output,
  // rather than silently reusing a stale bundle.
  execSync('npx expo export -p web --clear', {
    stdio: 'inherit',
    env: { ...process.env, HOMEFIX_WEB_EXPORT: '1' },
  });
} finally {
  // The mirror is only needed during the export above. Remove it so it never
  // lingers to be crawled by the dev server, ESLint, tsc, or Jest.
  fs.rmSync(mirror, { recursive: true, force: true });
}
