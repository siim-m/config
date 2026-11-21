import { defineRule } from '@oxlint/plugins';
import type { ESTree, Scope, SourceCode, Variable } from '@oxlint/plugins';

/** Methods that reorder an array in place and return the same array. */
const IN_PLACE: ReadonlySet<string> = new Set(['sort', 'reverse']);
/** Array methods that return a new array. */
const COPYING_METHODS: ReadonlySet<string> = new Set([
  'map',
  'filter',
  'slice',
  'concat',
  'flat',
  'flatMap',
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
  'split',
]);
/** Static functions that return a new array, as `Object.keys`. */
const COPYING_FUNCTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Object', new Set(['keys', 'values', 'entries', 'getOwnPropertyNames'])],
  ['Array', new Set(['from', 'of'])],
]);

const unwrap = (node: ESTree.Node): ESTree.Node =>
  node.type === 'ParenthesizedExpression' ||
  node.type === 'TSAsExpression' ||
  node.type === 'TSSatisfiesExpression' ||
  node.type === 'TSNonNullExpression' ||
  node.type === 'TSTypeAssertion'
    ? unwrap(node.expression)
    : node;

/** The binding a name refers to, found by walking scopes outward. */
function resolve(
  sourceCode: SourceCode,
  node: ESTree.Node & { readonly name: string }
): Variable | undefined {
  for (let scope: Scope | null = sourceCode.getScope(node); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable !== undefined) return variable;
  }
  return undefined;
}

const memberName = (node: ESTree.Node): string | undefined =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
    ? node.property.name
    : undefined;

/** The method called by `x.method(...)`, with the receiver `x`. */
function methodCall(
  node: ESTree.Node
): { readonly method: string; readonly receiver: ESTree.Node } | undefined {
  if (node.type !== 'CallExpression') return undefined;
  const callee = unwrap(node.callee);
  const method = memberName(callee);
  return method !== undefined && callee.type === 'MemberExpression'
    ? { method, receiver: callee.object }
    : undefined;
}

/**
 * Whether an expression evaluates to an array this code just made: a literal, the result of a
 * copying method or function, a sort of one of those, or a local binding in the same function
 * that holds one and is never reassigned.
 */
function isFresh(expression: ESTree.Node, call: ESTree.Node, sourceCode: SourceCode): boolean {
  const node = unwrap(expression);
  if (node.type === 'ArrayExpression') return true;
  if (node.type === 'ConditionalExpression') {
    return isFresh(node.consequent, call, sourceCode) && isFresh(node.alternate, call, sourceCode);
  }
  if (node.type === 'LogicalExpression') {
    return isFresh(node.left, call, sourceCode) && isFresh(node.right, call, sourceCode);
  }
  if (node.type === 'NewExpression' || node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier' && node.callee.name === 'Array') return true;
  }
  const called = methodCall(node);
  if (called !== undefined) {
    if (COPYING_METHODS.has(called.method)) return true;
    if (IN_PLACE.has(called.method)) return isFresh(called.receiver, call, sourceCode);
    const receiver = unwrap(called.receiver);
    if (receiver.type === 'Identifier') {
      return COPYING_FUNCTIONS.get(receiver.name)?.has(called.method) ?? false;
    }
    return false;
  }
  if (node.type !== 'Identifier') return false;
  const variable = resolve(sourceCode, node);
  const [definition] = variable?.defs ?? [];
  if (variable === undefined || variable.defs.length !== 1 || definition?.type !== 'Variable') {
    return false;
  }
  const declarator = definition.node;
  const reassigned = variable.references.some(
    (reference) => reference.isWrite() && !reference.init
  );
  // A binding outside this function, such as a module constant, is shared by every call.
  const sameFunction = variable.scope.variableScope === sourceCode.getScope(call).variableScope;
  return (
    !reassigned &&
    sameFunction &&
    declarator.type === 'VariableDeclarator' &&
    declarator.init !== null &&
    isFresh(declarator.init, call, sourceCode)
  );
}

/** Modules whose `sort` and `reverse` functions return a new array, such as Effect's `Array`. */
const COPYING_MODULE_SOURCE = /^(?:effect|@effect\/)/u;

/**
 * Whether a receiver is a module rather than an array: the global `Array`, a namespace import,
 * or a binding imported from Effect, as in `Array.sort(xs, order)` or `Arr.reverse(xs)`.
 */
function isModule(receiver: ESTree.Node, sourceCode: SourceCode): boolean {
  const node = unwrap(receiver);
  if (node.type !== 'Identifier') return false;
  const variable = resolve(sourceCode, node);
  if (variable === undefined) return node.name === 'Array';
  const [definition] = variable.defs;
  if (definition?.type !== 'ImportBinding') return false;
  const specifier = definition.node;
  const declaration = specifier.parent;
  return (
    specifier.type === 'ImportNamespaceSpecifier' ||
    (declaration?.type === 'ImportDeclaration' &&
      COPYING_MODULE_SOURCE.test(declaration.source.value))
  );
}

/**
 * Sort or reverse only arrays this code made. `sort()` and `reverse()` reorder the array in place,
 * so on a parameter, a property or a shared constant they change what the owner sees. Unlike
 * `unicorn/no-array-sort`, an array fresh from `map`, `filter`, `slice` or `Object.keys` may be
 * sorted in place, which needs no ES2023 `toSorted`.
 */
export const noSharedArraySortRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `sort()` and `reverse()` on an array the code did not just create.',
    },
    messages: {
      shared:
        "`{{method}}()` reorders this array in place, and this code didn't create it, so its owner sees the change. Reorder a copy, such as `[...items].{{method}}()`.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const called = methodCall(node);
        if (called === undefined || !IN_PLACE.has(called.method)) return;
        if (isModule(called.receiver, context.sourceCode)) return;
        if (isFresh(called.receiver, node, context.sourceCode)) return;
        context.report({ node, messageId: 'shared', data: { method: called.method } });
      },
    };
  },
});
