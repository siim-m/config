import { defineRule } from '@oxlint/plugins';
import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';
import {
  arrayMethodTarget,
  resolveArrayBinding,
  unwrapArrayExpression,
} from '../shared/array-method.ts';

/** Methods that reorder an array in place and return the same array. */
const IN_PLACE: ReadonlySet<string> = new Set(['sort', 'reverse']);
/** Directory listings, called as methods of Node's fs or Effect's FileSystem, which return a new array. */
const LISTINGS: ReadonlySet<string> = new Set(['readdirSync', 'readdir', 'readDirectory']);
/** Methods that return a new array. */
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
  ...LISTINGS,
]);
/** Global functions that return a new array, as `Object.keys`. */
const COPYING_FUNCTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Object', new Set(['keys', 'values', 'entries', 'getOwnPropertyNames'])],
  ['Array', new Set(['from', 'of'])],
]);
/** Effect's packages, whose `Array.sort` and `Chunk.reverse` return a copy. */
const COPYING_MODULE_SOURCE = /^(?:effect(?:\/|$)|@effect\/)/u;

/** The method called by `x.method(...)` or `x['method'](...)`, with the receiver `x`. */
function methodCall(
  node: ESTree.Node
): { readonly name: string; readonly object: ESTree.Node } | null {
  const call = unwrapArrayExpression(node);
  return call.type === 'CallExpression' ? arrayMethodTarget(call.callee) : null;
}

/** Whether a name refers to the global of that name rather than a local or an import. */
function isGlobal(node: ESTree.Node, sourceCode: SourceCode): boolean {
  return (resolveArrayBinding(sourceCode, node)?.defs.length ?? 0) === 0;
}

/**
 * Whether an expression evaluates to an array this code just made: a literal, the result of a
 * copying method or global function, a sort of one of those, or a local binding in the same
 * function that holds one and is never reassigned.
 */
function isFresh(
  expression: ESTree.Node,
  call: ESTree.Node,
  sourceCode: SourceCode,
  known: Map<Variable, boolean>
): boolean {
  const node = unwrapArrayExpression(expression);
  const fresh = (part: ESTree.Node) => isFresh(part, call, sourceCode, known);
  if (node.type === 'ArrayExpression') return true;
  // `await fsp.readdir(dir)` holds what the call returns.
  if (node.type === 'AwaitExpression') return fresh(node.argument);
  // `yield*` runs an Effect, whose `map` is no array method, so only a listing counts.
  if (node.type === 'YieldExpression' && node.delegate && node.argument !== null) {
    const listed = methodCall(node.argument);
    return listed !== null && LISTINGS.has(listed.name);
  }
  if (node.type === 'ConditionalExpression') return fresh(node.consequent) && fresh(node.alternate);
  if (node.type === 'LogicalExpression') return fresh(node.left) && fresh(node.right);
  if (node.type === 'NewExpression' || node.type === 'CallExpression') {
    const callee = unwrapArrayExpression(node.callee);
    if (callee.type === 'Identifier' && callee.name === 'Array' && isGlobal(callee, sourceCode)) {
      return true;
    }
  }
  const called = methodCall(node);
  if (called !== null) {
    if (COPYING_METHODS.has(called.name)) return true;
    if (IN_PLACE.has(called.name)) return fresh(called.object);
    const receiver = unwrapArrayExpression(called.object);
    return (
      receiver.type === 'Identifier' &&
      (COPYING_FUNCTIONS.get(receiver.name)?.has(called.name) ?? false) &&
      isGlobal(receiver, sourceCode)
    );
  }
  const variable = resolveArrayBinding(sourceCode, node);
  if (variable === null) return false;
  // A binding still being checked, as in `var list = list || []`, reads as not fresh. Every part
  // must be fresh, so that can't hide a fresh array, and a finished check is reused.
  const cached = known.get(variable);
  if (cached !== undefined) return cached;
  known.set(variable, false);
  const [definition] = variable.defs;
  const declarator = definition?.node;
  const reassigned = variable.references.some(
    (reference) => reference.isWrite() && !reference.init
  );
  // A binding outside this function, such as a module constant, is shared by every call.
  const sameFunction = variable.scope.variableScope === sourceCode.getScope(call).variableScope;
  const result =
    variable.defs.length === 1 &&
    definition?.type === 'Variable' &&
    declarator?.type === 'VariableDeclarator' &&
    declarator.id.type === 'Identifier' &&
    declarator.init !== null &&
    !reassigned &&
    sameFunction &&
    fresh(declarator.init);
  known.set(variable, result);
  return result;
}

/**
 * Whether a receiver is a module rather than an array: a namespace import, or a binding imported
 * from Effect, as in `Array.sort(xs, order)` or `Arr.reverse(xs)`.
 */
function isModule(receiver: ESTree.Node, sourceCode: SourceCode): boolean {
  const [definition] = resolveArrayBinding(sourceCode, receiver)?.defs ?? [];
  if (definition?.type !== 'ImportBinding') return false;
  const specifier = definition.node;
  const declaration = specifier.parent;
  return (
    specifier.type === 'ImportNamespaceSpecifier' ||
    (declaration?.type === 'ImportDeclaration' &&
      COPYING_MODULE_SOURCE.test(declaration.source.value))
  );
}

/** Whether a call's arguments fit `Array#sort(compare?)` or `Array#reverse()`. */
function fitsArrayMethod(name: string, call: ESTree.CallExpression): boolean {
  if (name === 'reverse') return call.arguments.length === 0;
  const [compare, ...rest] = call.arguments;
  return (
    rest.length === 0 &&
    compare?.type !== 'ObjectExpression' &&
    !(compare?.type === 'Literal' && typeof compare.value === 'string')
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
        '`{{method}}()` reorders this array in place, and this code may not own it, so the change can reach whoever shares it. Reorder a copy, such as `[...items].{{method}}()`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const called = arrayMethodTarget(node.callee);
        if (called === null || !IN_PLACE.has(called.name)) return;
        if (!fitsArrayMethod(called.name, node) || isModule(called.object, sourceCode)) return;
        if (isFresh(called.object, node, sourceCode, new Map())) return;
        context.report({ node, messageId: 'shared', data: { method: called.name } });
      },
    };
  },
});
