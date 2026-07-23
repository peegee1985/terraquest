const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  // A lone `ignores` key (no other properties) is ESLint flat config's
  // "global ignore" form — admin/ is a separate Vite/browser project with
  // its own tsconfig and tooling, not something the Expo/React Native lint
  // config (or the root tsconfig) should ever touch.
  { ignores: ['admin/**'] },
  expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'convex/_generated/**'],
    rules: {
      'import/order': ['warn', { 'newlines-between': 'always' }],
    },
  },
]);
