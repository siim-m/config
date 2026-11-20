import { defineRule } from '@oxlint/plugins';
import type { Comment } from '@oxlint/plugins';

const DIRECTIVE =
  /^\s*\*?\s*(?:(?:oxlint|eslint)-(?:disable|enable)|@ts-(?:expect-error|ignore|nocheck)|@effect-diagnostics|(?:prettier|oxfmt)-ignore|biome-ignore|svelte-ignore|(?:c8|v8|istanbul)\s+ignore)/u;
const TYPESCRIPT_DIRECTIVE = /^\s*\*?\s*@ts-(?:expect-error|ignore|nocheck)(?![\w-])(.*)$/su;
const EMPTY = /^[\s*]*$/u;

/**
 * Require every lint or type-checker suppression to say why: after ` -- ` (or after the
 * `@ts-` directive), or in a comment on the line above. Adapted from T3 Code's
 * `require-suppression-reason` (MIT, T3 Tools Inc.).
 */
export const requireSuppressionReasonRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: { description: 'Require every lint or type-checker suppression to say why.' },
    messages: {
      lintDirective:
        'Say why: end the directive with `-- reason`, or put a comment on the line above.',
      typescriptDirective:
        'Say why: write the reason after the directive, or in a comment on the line above.',
    },
  },
  createOnce(context) {
    return {
      Program() {
        const { sourceCode } = context;
        const comments = sourceCode.getAllComments();
        const ownLineByEndLine = new Map<number, Comment>();
        for (const comment of comments) {
          if (comment.type === 'Shebang') continue;
          const { line, column } = comment.loc.start;
          if ((sourceCode.lines[line - 1] ?? '').slice(0, column).trim() === '') {
            ownLineByEndLine.set(comment.loc.end.line, comment);
          }
        }

        /** Whether a prose comment sits directly above, past other directives and empty comments. */
        const explainedAbove = (directive: Comment) => {
          let above = ownLineByEndLine.get(directive.loc.start.line - 1);
          while (above !== undefined && (DIRECTIVE.test(above.value) || EMPTY.test(above.value))) {
            above = ownLineByEndLine.get(above.loc.start.line - 1);
          }
          return above !== undefined;
        };

        for (const directive of sourceCode.getDisableDirectives().directives) {
          if (directive.type === 'enable' || directive.justification?.trim()) continue;
          if (explainedAbove(directive.node)) continue;
          context.report({ loc: directive.node.loc, messageId: 'lintDirective' });
        }

        for (const comment of comments) {
          const after = TYPESCRIPT_DIRECTIVE.exec(comment.value)?.[1];
          if (after === undefined || after.replace(/^[\s:-]+/u, '').trim() !== '') continue;
          if (explainedAbove(comment)) continue;
          context.report({ loc: comment.loc, messageId: 'typescriptDirective' });
        }
      },
    };
  },
});
