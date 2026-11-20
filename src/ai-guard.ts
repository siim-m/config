import { eslintCompatPlugin } from '@oxlint/plugins';
import type { Rule } from '@oxlint/plugins';
import { rules } from 'eslint-plugin-ai-guard';

/**
 * The six eslint-plugin-ai-guard rules the preset uses. Its other rules repeat anti-slop, oxlint or
 * the type checker. They are typescript-eslint rule modules, which oxlint runs unchanged but whose
 * types differ from oxlint's `Rule`, so each is checked for a `create` function instead of cast.
 */
const NAMES = [
  'no-assertionless-test',
  'no-placeholder-implementation',
  'no-silent-fallback',
  'no-tautological-assertion',
  'no-test-env-branch',
  'no-undeclared-import',
] as const;

const isRule = (value: unknown): value is Rule =>
  typeof value === 'object' &&
  value !== null &&
  'create' in value &&
  typeof value.create === 'function';

const available: Readonly<Record<string, unknown>> = rules;

const aiGuardPlugin = eslintCompatPlugin({
  meta: { name: 'ai-guard' },
  rules: Object.fromEntries(
    NAMES.flatMap((name) => {
      const rule = available[name];
      return isRule(rule) ? [[name, rule] as const] : [];
    })
  ),
});

export default aiGuardPlugin;
