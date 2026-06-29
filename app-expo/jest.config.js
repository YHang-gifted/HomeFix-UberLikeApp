// Jest config for the HomeFix Expo app.
//
// The `jest-expo` preset transforms React Native / Expo modules. The tested
// product logic this screen consumes lives outside app-expo (../app/src and
// ../shared); those are plain TS files (not in node_modules), so the preset's
// default transform covers them. `zod` resolves from the repo-root node_modules
// via normal upward module resolution.
//
// moduleNameMapper: when Babel transforms those cross-folder files it injects
// `@babel/runtime` helper requires. Resolved from ../app/src they'd look in the
// repo-root node_modules (which has no @babel/runtime). Pin them to app-expo's
// own copy regardless of the importing file's location.
module.exports = {
  preset: 'jest-expo',
  // Only crawl src/ for tests and the haste map. This keeps generated build
  // artifacts that may sit on disk — the ./.shared web-export mirror and ./dist
  // — out of Jest entirely; crawling those duplicate/huge trees exhausted file
  // handles on Windows (EMFILE read errors) and caused widespread timeouts.
  // Relative imports of ../app/src and ../shared and node_modules still resolve
  // normally (they don't depend on the crawl roots).
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
};
