import type { OxfmtConfig } from 'oxfmt';

/**
 * Shared oxfmt settings. oxfmt has no `extends`, so spread them in `oxfmt.config.mts` and
 * set the repo's own values after the spread:
 *
 *   export default { ...base, singleQuote: false, ignorePatterns: [...] }
 *
 * `overrides` is an array, so a repo that sets it replaces the Svelte entry below.
 */
const base = {
  useTabs: false,
  singleQuote: true,
  trailingComma: 'es5',
  printWidth: 100,
  proseWrap: 'always',
  singleAttributePerLine: true,
  sortImports: { newlinesBetween: false },
  overrides: [{ files: ['**/*.svelte'], options: { svelte: true, sortTailwindcss: true } }],
} satisfies OxfmtConfig;

export default base;
