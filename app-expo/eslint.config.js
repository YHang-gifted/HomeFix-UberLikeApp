// ESLint flat config for the HomeFix Expo app. Separate from the repo-root
// config (which intentionally ignores app-expo); this one is used when linting
// from inside app-expo and applies Expo's recommended rules.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'web-build/**'],
  },
];
