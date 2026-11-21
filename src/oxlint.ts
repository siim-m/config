import type { OxlintConfig } from 'oxlint';

const TEST_FILES = ['**/*.test.*', '**/*.spec.*', '**/test/**', '**/tests/**', '**/__tests__/**'];

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
    { name: 'ai-guard', specifier: '@siim-m/config/ai-guard' },
    { name: 'landmines', specifier: '@siim-m/config/landmines' },
  ],
  categories: { correctness: 'error' },
  rules: {
    'anti-slop/comments': 'error',
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-disabled-type-assertion-rules': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reduce-accumulator-copy': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': 'error',
    'anti-slop/no-shared-array-sort': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-pascal-case-namespace-imports': 'error',
    'anti-slop/require-readable-spacing': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
    'anti-slop/require-suppression-reason': 'error',
    'anti-slop-effect/no-manual-effect-error-tag': 'error',
    'anti-slop-effect/no-ordie': 'error',
    'anti-slop-effect/no-service-constructor-imports': 'error',
    'anti-slop-effect/no-service-parameters': 'error',
    'anti-slop-effect/no-unbounded-retry': 'error',
    'anti-slop-effect/prefer-effect-match': 'error',
    'anti-slop-effect/require-cause-when-narrowing': 'error',
    'anti-slop-effect/throw-in-effect-gen': 'error',
    'ai-guard/no-placeholder-implementation': 'error',
    'ai-guard/no-silent-fallback': 'error',
    'ai-guard/no-tautological-assertion': 'error',
    'ai-guard/no-test-env-branch': 'error',
    'ai-guard/no-undeclared-import': 'error',
    'landmines/no-fixed-sleep': 'error',
    'landmines/no-flake-masking': 'error',
    'landmines/no-unsignaled-poll': 'error',
    'landmines/strict-msw': 'error',
    // Spreads in reducers; anti-slop/no-reduce-accumulator-copy covers the other copies.
    'oxc/no-accumulating-spread': 'error',
    eqeqeq: 'error',
    'typescript/consistent-type-imports': 'error',
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
    // Type-aware: these run only with `oxlint --type-aware` and tsrs or oxlint-tsgolint installed.
    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    'typescript/no-unnecessary-type-conversion': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/no-unsafe-type-assertion': 'error',
    'typescript/only-throw-error': 'error',
    'typescript/switch-exhaustiveness-check': [
      'error',
      { allowDefaultCaseForExhaustiveSwitch: true, considerDefaultExhaustiveForUnions: true },
    ],
    'typescript/use-unknown-in-catch-callback-variable': 'error',
  },
  overrides: [
    {
      files: TEST_FILES,
      rules: {
        // A test may throw inside Effect.gen to fail on purpose, or die on a broken fixture.
        'anti-slop-effect/throw-in-effect-gen': 'off',
        'anti-slop-effect/no-ordie': 'off',
      },
    },
  ],
} satisfies OxlintConfig;

export default preset;
