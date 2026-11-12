import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const HOOK_NAME = /^use[A-Z]/;
// Bare `use` is React 19's `use(promise | context)`, which is a hook call too.
const HOOK_CALLEE = /^use([A-Z]|$)/;

type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

function isHookCall(callee: ESTree.Expression): boolean {
  if (callee.type === 'Identifier') return HOOK_CALLEE.test(callee.name);
  return (
    callee.type === 'MemberExpression' && !callee.computed && HOOK_CALLEE.test(callee.property.name)
  );
}

/** The name a function is declared or assigned under, as `function useX` or `const useX = () =>`. */
function functionName(node: FunctionNode): ESTree.BindingIdentifier | undefined {
  if (node.type === 'FunctionDeclaration') return node.id ?? undefined;
  const parent = node.parent;
  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === node &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id;
  }
  return undefined;
}

/**
 * Disallow `use*` functions that call no hook during their own body. React treats the name as
 * a hook, and the React Compiler only memoizes functions that call one, so whatever a hook-less
 * `use*` function returns is rebuilt on every render. Ported from T3 Code, which mirrors
 * eslint-react's `no-unnecessary-use-prefix`.
 */
export const noHooklessUseFunctionRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow use* functions that call no hooks.',
    },
    messages: {
      noHook:
        '"{{name}}" calls no hooks, so the React Compiler skips it and whatever it returns is rebuilt on every render. Rename it to a plain function, or read the hook it depends on inside it.',
    },
  },
  createOnce(context) {
    // One entry per function being visited: whether its own body, outside nested functions,
    // calls a hook.
    const callsHook: boolean[] = [];

    const enter = () => {
      callsHook.push(false);
    };
    const exit = (node: FunctionNode) => {
      const called = callsHook.pop();
      const name = functionName(node);
      if (called === true || name === undefined || !HOOK_NAME.test(name.name)) return;
      context.report({ node: name, messageId: 'noHook', data: { name: name.name } });
    };

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      'FunctionDeclaration:exit': exit,
      'FunctionExpression:exit': exit,
      'ArrowFunctionExpression:exit': exit,
      CallExpression(node) {
        if (callsHook.length > 0 && isHookCall(node.callee)) {
          callsHook[callsHook.length - 1] = true;
        }
      },
    };
  },
});
