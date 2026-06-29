// Mirror the shared product logic (../app/src and ../shared) into ./.shared so
// the web export can bundle it. `expo export -p web` will not pull source files
// from outside the Expo project root into its Metro file map (it fails with
// "Failed to get the SHA-1"), so the web build resolves the shared code to this
// in-project copy instead (see metro.config.js -> resolveSharedSource).
//
// The mirror preserves the original ../app and ../shared sibling layout so the
// shared modules' own relative imports (e.g. ../../../shared/schemas.ts) resolve
// unchanged. It is a build artifact: gitignored, and safe to delete/regenerate.
// Native bundling is unaffected and always uses the real source, so this only
// needs to run before a web export.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(projectRoot, '..');
const mirror = path.join(projectRoot, '.shared');

// Skip test files and any nested dependency dirs.
const SKIP_FILE = /(\.test\.[cm]?[jt]sx?$)|(\.spec\.[cm]?[jt]sx?$)/;
const SKIP_DIR = new Set(['node_modules', '__tests__']);

/** @param {string} relName repo-root-relative directory to mirror */
function mirrorDir(relName) {
  const src = path.join(repoRoot, relName);
  const dest = path.join(mirror, relName);
  if (!fs.existsSync(src)) {
    throw new Error(`sync-shared: source directory not found: ${src}`);
  }
  fs.cpSync(src, dest, {
    recursive: true,
    filter(from) {
      const stats = fs.statSync(from);
      if (stats.isDirectory()) return !SKIP_DIR.has(path.basename(from));
      return !SKIP_FILE.test(from);
    },
  });
}

fs.rmSync(mirror, { recursive: true, force: true });
mirrorDir(path.join('app', 'src'));
mirrorDir('shared');

const rel = path.relative(projectRoot, mirror);
console.log(`sync-shared: mirrored ../app/src and ../shared into ${rel}/`);
