// Metro config for the HomeFix Expo app.
//
// The tested, shared product logic lives at the repo root (../app/src and
// ../shared) so it stays covered by the root tsx/Node test harness and CI.
// Two adjustments let Metro bundle it from here:
//   1. watchFolders: let Metro see files above this project (../app, ../shared)
//      and resolve packages (e.g. zod) from the root node_modules.
//   2. resolveRequest shim: those modules import each other with explicit
//      `.ts`/`.tsx` extensions (required by the root tsx/Node ESM harness).
//      Strip the extension before delegating to Metro's default resolver.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stripped = moduleName.replace(/\.tsx?$/, '');
  const resolve = baseResolveRequest ?? context.resolveRequest;
  return resolve(context, stripped, platform);
};

module.exports = config;
