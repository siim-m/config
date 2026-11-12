import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const MEMO_HOOKS = new Set(['useCallback', 'useMemo']);
// "use no memo" and "use no forget" skip a function the compiler would bail on, which hides
// the bailout as much as "use memo" does.
const OPT_OUT_DIRECTIVES = new Set(['use no memo', 'use no forget']);

function memoHookName(callee: ESTree.Expression): string | undefined {
  if (callee.type === 'Identifier') return MEMO_HOOKS.has(callee.name) ? callee.name : undefined;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'React' &&
    MEMO_HOOKS.has(callee.property.name)
  ) {
    return callee.property.name;
  }
  return undefined;
}

/**
 * Disallow `useMemo`, `useCallback` and the compiler's memo directives. The React Compiler
 * memoizes components and hooks itself, so manual memoization is noise, and a directive
 * hides the code the compiler withheld a cache scope from. Ported from T3 Code.
 */
export const noManualMemoRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow useMemo, useCallback and memo directives; the React Compiler memoizes components and hooks.',
    },
    messages: {
      memoHook:
        'Drop {{name}}: the React Compiler memoizes this. Write the plain value or function.',
      useMemoDirective:
        'Drop "use memo": restructure so the compiler caches this on its own, for example by moving plain uses of a value before the hook call that splits its scope, or by inlining the helper.',
      optOutDirective:
        'Drop "{{directive}}": fix the code the compiler cannot prove safe instead of skipping it.',
    },
  },
  createOnce(context) {
    return {
      ExpressionStatement(node) {
        if (node.directive === 'use memo') {
          context.report({ node, messageId: 'useMemoDirective' });
        } else if (typeof node.directive === 'string' && OPT_OUT_DIRECTIVES.has(node.directive)) {
          context.report({
            node,
            messageId: 'optOutDirective',
            data: { directive: node.directive },
          });
        }
      },
      CallExpression(node) {
        const name = memoHookName(node.callee);
        if (name === undefined) return;
        context.report({ node: node.callee, messageId: 'memoHook', data: { name } });
      },
    };
  },
});
