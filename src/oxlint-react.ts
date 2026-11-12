import type { OxlintConfig } from 'oxlint';

/**
 * React preset, for code the React Compiler compiles. Extend it after the base preset:
 *
 *   export default defineConfig({ extends: [base, react] })
 *
 * The base preset's `correctness` category also turns on the react and jsx-a11y plugins'
 * correctness rules, which include the React Compiler's checks (`react/purity`, `react/refs`,
 * `react/set-state-in-effect` and others). The rules below come from other categories.
 */
const preset = {
  plugins: ['react', 'jsx-a11y'],
  jsPlugins: [{ name: 'anti-slop-react', specifier: '@siim-m/config/anti-slop-react' }],
  rules: {
    'anti-slop-react/no-hookless-use-function': 'error',
    'anti-slop-react/no-manual-memo': 'error',
    'anti-slop-react/require-sync-comment-for-effect': 'error',
    // oxlint files rules-of-hooks under pedantic, so the correctness category misses it.
    'react/rules-of-hooks': 'error',
    // A disable comment for exhaustive-deps or rules-of-hooks makes the compiler skip the function.
    'react/rule-suppression': 'error',
    'react/capitalized-calls': 'error',
    'react/unsupported-syntax': 'error',
    // Vite's Fast Refresh keeps state only in modules that export just components.
    'react/only-export-components': ['error', { allowConstantExport: true }],
    'react/prefer-function-component': 'error',
    'react/no-array-index-key': 'error',
    'react/hook-use-state': 'error',
    'react/display-name': 'error',
    'react/no-react-children': 'error',
    'react/no-clone-element': 'error',
    'react/button-has-type': 'error',
    'react/jsx-no-target-blank': ['error', { forms: true }],
    'react/jsx-no-script-url': 'error',
    'react/iframe-missing-sandbox': 'error',
    'react/no-danger': 'error',
    'react/checked-requires-onchange-or-readonly': 'error',
    'react/jsx-no-comment-textnodes': 'error',
    'react/no-unescaped-entities': 'error',
    'react/style-prop-object': 'error',
    'react/no-namespace': 'error',
    'react/self-closing-comp': 'error',
    'react/jsx-curly-brace-presence': 'error',
    'react/jsx-fragments': 'error',
    'react/jsx-no-useless-fragment': 'error',
    'react/jsx-pascal-case': 'error',
  },
  overrides: [
    {
      // `{count && <p />}` renders "0". Optional booleans and strings render nothing when
      // falsy, so only numbers are checked. Type-aware.
      files: ['**/*.tsx'],
      rules: {
        'typescript/strict-boolean-expressions': [
          'error',
          { allowNumber: false, allowNullableBoolean: true, allowNullableString: true },
        ],
      },
    },
  ],
} satisfies OxlintConfig;

export default preset;
