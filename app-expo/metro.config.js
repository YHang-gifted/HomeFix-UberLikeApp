// Metro config for the HomeFix Expo app.
//
// The tested, shared product logic lives at the repo root (../app/src and
// ../shared) so it stays covered by the root tsx/Node test harness and CI.
// Three adjustments let Metro bundle it from here:
//   1. watchFolders: let Metro watch the shared source siblings (../app,
//      ../shared) and the root node_modules (for packages like zod). These are
//      listed explicitly rather than as the parent repo root — the dev server
//      tolerates an ancestor watch folder, but the web export crawler does not
//      pick up the ancestor's other children, which breaks `expo export -p web`.
//   2. resolveSharedSource: relative imports that escape this project root into
//      the shared code (../app, ../shared) are resolved to an absolute source
//      file ourselves. Expo's web resolver chain rejects out-of-root relative
//      paths (native is lenient and works without this), so the web export only
//      bundles when we hand Metro the resolved file directly. Native resolves to
//      the exact same files, so on-device behaviour is unchanged.
//   3. extension strip: the shared modules import each other with explicit
//      `.ts`/`.tsx` extensions (required by the root tsx/Node ESM harness); strip
//      those before delegating any remaining requests to Metro's default resolver.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(repoRoot, 'app'),
  path.resolve(repoRoot, 'shared'),
  path.resolve(repoRoot, 'node_modules'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

const SOURCE_EXTS = ['ts', 'tsx', 'js', 'jsx', 'json', 'cjs', 'mjs'];
const EXT_RE = /\.(tsx?|jsx?|json|cjs|mjs)$/;

// In-project mirror of ../app/src and ../shared produced by scripts/sync-shared.mjs.
// `expo export -p web` will not pull source files from outside the project root
// into its file map (it fails with "Failed to get the SHA-1"), so the static web
// export resolves the shared code to this mirror instead.
const SHARED_MIRROR = path.resolve(projectRoot, '.shared');
const ROOT_NODE_MODULES = path.resolve(repoRoot, 'node_modules');

// The mirror is used ONLY by the static web export (`npm run export:web` sets
// HOMEFIX_WEB_EXPORT=1). Everything else — the `npm run web` dev server AND native
// — uses the real, live out-of-root source with NO sync step, exactly as before.
// This matters: bundling the mirror from inside app-expo would resolve bare deps
// (notably `zod`) against app-expo's own copy (3.x, which lacks `z.uuid`) instead
// of the root's 4.x that the shared code is written and tested against.
const USE_MIRROR = process.env.HOMEFIX_WEB_EXPORT === '1';

// First file that exists for a resolution base, trying platform + extension
// variants and an index file, mirroring Metro's own lookup order.
function firstExistingFile(base, originalWithExt, platform) {
  const prefixes = platform ? [`${base}.${platform}`, base] : [base];
  const candidates = [];
  for (const prefix of prefixes) {
    for (const ext of SOURCE_EXTS) candidates.push(`${prefix}.${ext}`);
  }
  if (originalWithExt) candidates.push(originalWithExt);
  for (const prefix of prefixes) {
    for (const ext of SOURCE_EXTS) {
      candidates.push(path.join(prefix, `index.${ext}`));
    }
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// Resolve a relative import that escapes the Expo project root but stays within
// the repo (the shared ../app and ../shared code) to a concrete source file.
// Returns a Metro resolution object, or null to let the default chain handle it.
function resolveSharedSource(context, moduleName, platform) {
  if (!moduleName.startsWith('.')) return null;
  const origin = context.originModulePath;
  if (!origin) return null;

  const absRequest = path.resolve(path.dirname(origin), moduleName);
  const fromProject = path.relative(projectRoot, absRequest);
  const escapesProject = fromProject === '..' || fromProject.startsWith('..' + path.sep);
  if (!escapesProject) return null; // inside the Expo project — Metro handles it
  const fromRepo = path.relative(repoRoot, absRequest);
  if (fromRepo.startsWith('..')) return null; // outside the repo

  const originalWithExt = EXT_RE.test(absRequest) ? absRequest : null;

  // Static web export only: prefer the in-project mirror so the file is inside
  // the crawled root. The dev server / native fall through to the real source.
  if (platform === 'web' && USE_MIRROR) {
    const mirrorAbs = path.join(SHARED_MIRROR, fromRepo);
    const mirrored = firstExistingFile(
      mirrorAbs.replace(EXT_RE, ''),
      EXT_RE.test(mirrorAbs) ? mirrorAbs : null,
      platform,
    );
    if (mirrored) return { type: 'sourceFile', filePath: mirrored };
  }

  // Native (and web fallback): resolve the real shared source in place.
  const original = firstExistingFile(absRequest.replace(EXT_RE, ''), originalWithExt, platform);
  if (original) return { type: 'sourceFile', filePath: original };
  return null;
}

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = baseResolveRequest ?? context.resolveRequest;

  // During the web export, bare packages imported by the mirrored shared code
  // must resolve from the ROOT node_modules (e.g. zod 4.x with `z.uuid`), not
  // app-expo's transitive 3.x. Re-anchor the resolution origin at the repo root.
  if (
    USE_MIRROR &&
    (moduleName === 'zod' || moduleName.startsWith('zod/')) &&
    typeof context.originModulePath === 'string' &&
    context.originModulePath.startsWith(SHARED_MIRROR)
  ) {
    const rootAnchor = path.join(ROOT_NODE_MODULES, '..', 'zodAnchor.js');
    return resolve({ ...context, originModulePath: rootAnchor }, moduleName, platform);
  }

  const shared = resolveSharedSource(context, moduleName, platform);
  if (shared) return shared;
  const stripped = moduleName.replace(/\.tsx?$/, '');
  return resolve(context, stripped, platform);
};

module.exports = config;
