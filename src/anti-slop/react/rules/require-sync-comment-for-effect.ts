import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const EFFECT_HOOK_TEXT = /use(?:Layout|Insertion)?Effect/;
const SYNC_COMMENT = /(?:^|[^\p{L}\p{N}_])SYNC\s*:\s*\S/u;
const statementKinds = new Set(['ExpressionStatement', 'ReturnStatement', 'VariableDeclaration']);

function isEffectHookCall(callee: ESTree.Expression): boolean {
  if (callee.type === 'Identifier') return EFFECT_HOOKS.has(callee.name);
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    EFFECT_HOOKS.has(callee.property.name)
  );
}

/**
 * Require a `SYNC:` comment above every `useEffect`, `useLayoutEffect` and
 * `useInsertionEffect`, naming what outside React the effect keeps in step. Most effects
 * should be a derivation during render or an event handler instead, and the message walks
 * through those first. Adapted from T3 Code's `no-unreasoned-state-sync`, which asks for a
 * disable comment with a reason instead.
 */
export const requireSyncCommentForEffectRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a SYNC comment naming what outside React each effect hook keeps in step.',
    },
    messages: {
      missingSyncComment:
        'Stop and reconsider before keeping this effect. ' +
        'Is it computable from props or state? Compute it during render; the compiler memoizes it. ' +
        'Does it respond to a user action? Do it in that handler. ' +
        'Does it reset state when a prop changes? Key the component on that prop. ' +
        'Does it tell a parent or store that a value changed? Do it where the change happens. ' +
        'Does it read a value from outside React? Use useSyncExternalStore or the data library. ' +
        'An effect that sets state another effect reads is one handler or one derivation. ' +
        'An effect is right only when it keeps something outside React in step with this component while mounted: ' +
        'a DOM node, listener, timer, connection, third-party widget, or a resource held until unmount. ' +
        'Moving the same logic into a ref or store to avoid this rule is not a fix. ' +
        'If the effect does that, name what it keeps in step in a comment above it: `// SYNC: <what and why>`.',
    },
  },
  createOnce(context) {
    /** A SYNC comment before the call, or before any node between it and its statement. */
    const hasSyncComment = (node: ESTree.CallExpression): boolean => {
      let current: ESTree.Node = node;
      while (true) {
        if (context.sourceCode.getCommentsBefore(current).some((c) => SYNC_COMMENT.test(c.value))) {
          return true;
        }
        if (statementKinds.has(current.type) || current.parent.type === 'Program') return false;
        current = current.parent;
      }
    };

    return {
      // A file that never names an effect hook can't call one.
      before: () => EFFECT_HOOK_TEXT.test(context.sourceCode.text),
      CallExpression(node) {
        if (!isEffectHookCall(node.callee) || hasSyncComment(node)) return;
        context.report({ node, messageId: 'missingSyncComment' });
      },
    };
  },
});
