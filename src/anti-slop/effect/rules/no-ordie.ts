import { defineRule } from '@oxlint/plugins';
import type { ESTree, SourceCode } from '@oxlint/plugins';
import {
  collectEffectModuleNames,
  isFunction,
  moduleCallName,
  moduleMemberName,
  resolveIdentifier,
  resolveInitializer,
  returnedExpressions,
  unwrapExpression,
  unwrapNode,
  type EffectModule,
  type EffectModuleNames,
} from '../shared/effect-modules.ts';

const ORDIE_MODULES: readonly EffectModule[] = ['Effect', 'Stream'];
const ORDIE_MEMBERS: ReadonlySet<string> = new Set(['orDie', 'orDieWith']);
/** Effect 4's `catch` and Effect 3's `catchAll`, which take every error in the channel. */
const CATCH_ALL_MEMBERS: ReadonlySet<string> = new Set(['catch', 'catchAll']);
const DIE_MEMBERS: ReadonlySet<string> = new Set(['die', 'dieMessage', 'dieSync']);

/** The module of `<module>.<member>` among `modules`, when the member is one of `members`. */
function memberOf(
  node: ESTree.Node,
  names: EffectModuleNames,
  modules: readonly EffectModule[],
  members: ReadonlySet<string>
): readonly [EffectModule, string] | undefined {
  for (const module of modules) {
    const member = moduleMemberName(node, names, module);
    if (member !== null && members.has(member)) return [module, member];
  }
  return undefined;
}

/**
 * Whether a catch handler turns every error into a defect: `Effect.die`, or a function, inline or
 * declared in this file, that only returns a death.
 */
function alwaysDies(
  handler: ESTree.Node,
  names: EffectModuleNames,
  sourceCode: SourceCode
): boolean {
  let node = unwrapNode(handler);
  if (node.type === 'Identifier') {
    // Only a binding that is never reassigned still holds what it was declared with.
    const reassigned = resolveIdentifier(sourceCode, node)?.references.some(
      (reference) => reference.isWrite() && !reference.init
    );
    const initializer = reassigned === false ? resolveInitializer(sourceCode, node) : null;
    if (initializer === null) return false;
    node = unwrapNode(initializer);
  }
  if (memberOf(node, names, ORDIE_MODULES, DIE_MEMBERS) !== undefined) return true;
  if (!isFunction(node)) return false;
  const returned = returnedExpressions(node);
  return (
    returned.length > 0 &&
    returned.every((expression) => {
      const call = unwrapExpression(expression);
      return (
        call.type === 'CallExpression' &&
        memberOf(unwrapExpression(call.callee), names, ORDIE_MODULES, DIE_MEMBERS) !== undefined
      );
    })
  );
}

/**
 * Keep errors typed: `orDie` turns every error in the channel into a defect, including errors added
 * to it later, so die only on errors named with `catchTag` or `catchTags`. The preset turns it off
 * in test files, where a broken fixture may stop the run.
 */
export const noOrDieRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `orDie` and catch-all handlers that die; die only on errors named with `catchTag`.',
    },
    messages: {
      orDie:
        "`{{module}}.{{member}}` turns every error in the channel into a defect, including ones added later, and the types won't show it. Die only on the errors you mean with `{{module}}.catchTag('Tag', {{module}}.die)` or `catchTags`, so a new error stays in the error type.",
      catchDie:
        "This catch turns every error in the channel into a defect, as `orDie` does, including ones added later. Die only on the errors you mean with `{{module}}.catchTag('Tag', {{module}}.die)` or `catchTags`, so a new error stays in the error type.",
      layerOrDie:
        "`Layer.orDie` hides every construction failure of this layer as a defect, including ones added later. Leave them in the layer's error channel and handle them where the runtime is built.",
    },
  },
  create(context) {
    const names = collectEffectModuleNames(context.sourceCode.ast);

    return {
      MemberExpression(node) {
        if (moduleMemberName(node, names, 'Layer') === 'orDie') {
          context.report({ node, messageId: 'layerOrDie' });
          return;
        }
        const found = memberOf(node, names, ORDIE_MODULES, ORDIE_MEMBERS);
        if (found === undefined) return;
        const [module, member] = found;
        context.report({ node, messageId: 'orDie', data: { module, member } });
      },
      CallExpression(node) {
        const module = ORDIE_MODULES.find((candidate) => {
          const member = moduleCallName(node, names, candidate);
          return member !== null && CATCH_ALL_MEMBERS.has(member);
        });
        // The handler is the last argument, data-first or data-last.
        const handler = node.arguments.at(-1);
        if (module === undefined || handler === undefined) return;
        if (!alwaysDies(handler, names, context.sourceCode)) return;
        context.report({ node, messageId: 'catchDie', data: { module } });
      },
    };
  },
});
