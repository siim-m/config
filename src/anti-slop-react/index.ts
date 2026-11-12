import { eslintCompatPlugin } from '@oxlint/plugins';
import { noHooklessUseFunctionRule } from './rules/no-hookless-use-function.ts';
import { noManualMemoRule } from './rules/no-manual-memo.ts';
import { requireSyncCommentForEffectRule } from './rules/require-sync-comment-for-effect.ts';

/** Oxlint rules for React code that the React Compiler compiles. */
const antiSlopReactPlugin = eslintCompatPlugin({
  meta: { name: 'anti-slop-react' },
  rules: {
    'no-hookless-use-function': noHooklessUseFunctionRule,
    'no-manual-memo': noManualMemoRule,
    'require-sync-comment-for-effect': requireSyncCommentForEffectRule,
  },
});

export default antiSlopReactPlugin;
