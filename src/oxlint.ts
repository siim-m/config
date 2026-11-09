import type { OxlintConfig } from 'oxlint';

/**
 * Shared oxlint preset. Extend it from `oxlint.config.mts`:
 *
 *   export default defineConfig({ extends: [base], ignorePatterns: [...], rules: { ... } })
 *
 * Every rule here is on. A repo that can't pass one yet turns it off in its own config, so
 * its list of `'off'` rules is its to-do list. `ignorePatterns` are not inherited.
 */
const preset = {
  jsPlugins: [
    { name: 'anti-slop', specifier: '@siim-m/config/anti-slop' },
    { name: 'anti-slop-effect', specifier: '@siim-m/config/anti-slop-effect' },
  ],
  categories: { correctness: 'error' },
  rules: {
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reduce-accumulator-copy': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-pascal-case-namespace-imports': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
    'anti-slop-effect/no-manual-effect-error-tag': 'error',
    'anti-slop-effect/no-service-constructor-imports': 'error',
    'anti-slop-effect/no-service-parameters': 'error',
    'anti-slop-effect/prefer-effect-match': 'error',
    // Spreads in reducers; anti-slop/no-reduce-accumulator-copy covers the other copies.
    'oxc/no-accumulating-spread': 'error',
    // Type-aware: these run only with `oxlint --type-aware` and oxlint-tsgolint installed.
    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': 'error',
  },
} satisfies OxlintConfig;

export default preset;
