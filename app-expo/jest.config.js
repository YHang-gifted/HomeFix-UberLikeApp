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
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
};
