import { defineRule } from '@oxlint/plugins';
import type { Comment, ESTree, SourceCode } from '@oxlint/plugins';

interface Forbidden {
  readonly pattern: string;
  readonly message: string;
}

interface Options {
  readonly policy: 'budget' | 'tagged-only';
  readonly maxWords: number;
  readonly maxExportDocWords: number;
  readonly allow: readonly string[];
  readonly forbidden: readonly Forbidden[];
}

const DIRECTIVE =
  /^(?:(?:oxlint|eslint)-|@ts-|@effect-diagnostics|(?:prettier|oxfmt)-ignore|biome-ignore|svelte-ignore|(?:c8|v8|istanbul)\s+ignore|@(?:vitest|jest)-environment|@vite-ignore|webpack[A-Z]\w*:|@jsx|[@#]__(?:PURE|NO_SIDE_EFFECTS|INLINE|NOINLINE)__|\/\s*<(?:reference|amd-module|amd-dependency)\s|#\s*source(?:Mapping)?URL=|#(?:end)?region\b|nosemgrep\b)/u;
const LICENSE = /@license\b|\bSPDX-License-Identifier\b|\bcopyright\b/iu;
const URL = /\bhttps?:\/\/\S+/gu;
const CODE_SPAN = /`[^`]*`/gu;
const ISSUE = /(?<![\w&/])#\d+\b(?![a-f])/giu;
const DIVIDER = /^(?:[-=*#~_/+]{3,}.*|.*[-=*#~_]{3,})$/u;
const STEP_LABEL = /^(?:arrange|act|assert|given|when|then)\s*[:.]?$/iu;
const TASK_MARKER = /\b(?:TODO|FIXME|XXX|HACK)\b/u;
const TASK_LINK = /#\d+|https?:\/\//u;
const JSDOC_TYPE = /^@(?:param|returns?|type|typedef)\s+\{/u;
const EMPTY_JSDOC_TAG = /^@(?:param(?:\s+\[?[\w$.]+\]?)?|returns?)$/u;
const COMMENTED_CODE =
  /^(?:(?:(?:const|let|var)\s+[\w${}[\], ]+=.*|import\s.+\sfrom\s+["'].+["']|(?:await\s+|return\s+)?[\w$.]+\(.*\)|[\w$.[\]]+\s*=\s*.+);|(?:if|for|while|switch)\s*\(.*\)\s*\{|\}(?:\s*else\s*\{)?)$/u;
const DECLARATION =
  /^\s*(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:static\s+)?(?:readonly\s+)?(?:(?:const|let|var|function\*?|class|interface|type|enum)\s+)?([A-Za-z_$][\w$]*)\s*[?!]?\s*[:=(<{]/u;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const FILLER = new Set(
  'a an the of for to in on at by with from and or is are be this that it its as get set return create new current value given whether'.split(
    ' '
  )
);

/** The words a comment or name carries once filler words go and plurals fold. */
const contentWords = (text: string): readonly string[] =>
  (text.toLowerCase().match(/[a-z0-9]+/gu) ?? [])
    .filter((word) => !FILLER.has(word))
    .map((word) => (word.length > 3 ? word.replace(/([^s])s$/u, '$1') : word))
    .filter((word) => !FILLER.has(word));

const nameWords = (name: string): ReadonlySet<string> =>
  new Set(
    contentWords(name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2'))
  );

const isDoc = (comment: Comment): boolean => comment.type === 'Block' && comment.value.startsWith('*');

/** A comment's lines of prose: no doc-comment stars, blank lines or directives. */
const textLines = (comment: Comment): readonly string[] =>
  comment.value
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/u, '').trim())
    .filter((line) => line !== '' && line !== '*' && !DIRECTIVE.test(line));

/** Adjacent `//` lines at one indent read as one comment. */
function commentGroups(comments: readonly Comment[], text: string): readonly (readonly Comment[])[] {
  const groups: Comment[][] = [];
  for (const comment of comments) {
    if (comment.type === 'Shebang') continue;
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const continues =
      group !== undefined &&
      previous?.type === 'Line' &&
      comment.type === 'Line' &&
      previous.loc.start.column === comment.loc.start.column &&
      /^[ \t]*\r?\n[ \t]*$/u.test(text.slice(previous.end, comment.start));
    if (continues) group.push(comment);
    else groups.push([comment]);
  }
  return groups;
}

/** The doc comment directly above a node, looking past directives such as `oxlint-disable-next-line`. */
function docBefore(node: ESTree.Node, sourceCode: SourceCode): Comment | undefined {
  const comments = sourceCode.getCommentsBefore(node);
  let comment = comments.pop();
  while (comment !== undefined && !isDoc(comment) && textLines(comment).length === 0) comment = comments.pop();
  return comment !== undefined && isDoc(comment) ? comment : undefined;
}

const isExport = (node: ESTree.Node): boolean =>
  node.type === 'ExportNamedDeclaration' ||
  node.type === 'ExportDefaultDeclaration' ||
  node.type === 'ExportAllDeclaration';

/** Whether a member belongs to an exported declaration and is public: not in a function body, not private. */
function isExposedMember(member: ESTree.Node): boolean {
  let node: ESTree.Node = member;
  for (;;) {
    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') return false;
    if ('accessibility' in node && (node.accessibility === 'private' || node.accessibility === 'protected')) {
      return false;
    }
    if ('key' in node && node.key.type === 'PrivateIdentifier') return false;
    const parent: ESTree.Node | null = node.parent;
    if (parent === null) return false;
    if (parent.type === 'Program') return isExport(node);
    node = parent;
  }
}

/**
 * Hold comments to a short why: a word budget, at most one cited issue, configured patterns, and
 * no dividers, step labels, commented-out code, untracked TODOs, JSDoc types or comments that only
 * repeat the name below them. `tagged-only` keeps just directives, licence headers, docs on exports
 * and comments that start with an allowed prefix such as `SAFETY:`.
 */
export const commentsRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Hold comments to a short why, or with the tagged-only policy, to tagged comments and docs on exports.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          policy: { enum: ['budget', 'tagged-only'] },
          maxWords: { type: 'integer', minimum: 1 },
          maxExportDocWords: { type: 'integer', minimum: 1 },
          allow: { type: 'array', items: { type: 'string', minLength: 1 } },
          forbidden: {
            type: 'array',
            items: {
              type: 'object',
              properties: { pattern: { type: 'string' }, message: { type: 'string' } },
              required: ['pattern', 'message'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      { policy: 'budget', maxWords: 30, maxExportDocWords: 45, allow: ['SAFETY', 'SYNC', 'WARNING'], forbidden: [] },
    ],
    messages: {
      tooLong:
        "This comment has {{words}} words; the limit is {{max}}. Keep the why the code can't say, and leave the history to git and the PR.",
      issueChain: 'This comment cites {{count}} issues. Cite the one that decided the code; git has the rest.',
      forbidden: 'This comment has `{{match}}` in it. {{message}}',
      divider: "Drop the section divider. Split the file, or let the code's structure show the grouping.",
      stepLabel: 'Drop the test step label.',
      commentedOutCode: 'Delete the commented-out code; git keeps it.',
      restatesName: 'This comment only repeats the name below it. Say why, or say nothing.',
      untrackedTask: 'Link the issue that tracks this, or drop the marker.',
      jsdocType: 'Drop the JSDoc type; TypeScript has it.',
      emptyJsdocTag: 'Drop the JSDoc tag that has no description.',
      untagged:
        'Remove this comment: put the meaning in names and the rationale in the PR. Comments that start with {{prefixes}}, directives and docs on exports stay.',
    },
  },
  create(context) {
    // SAFETY: oxlint validates the options against the schema above and fills in defaultOptions.
    const [options] = context.options as unknown as readonly [Options];
    const { sourceCode } = context;
    const typescript = TYPESCRIPT_FILE.test(context.filename);
    const forbidden = options.forbidden.map(({ pattern, message }) => ({ pattern: new RegExp(pattern, 'u'), message }));
    const isTagged = (line: string) =>
      options.allow.some((prefix) => line.startsWith(`${prefix}:`) && line.slice(prefix.length + 1).trim() !== '');
    const prefixes = options.allow.map((prefix) => `\`${prefix}:\``).join(', ');
    const members: ESTree.Node[] = [];
    const collect = (node: ESTree.Node) => {
      members.push(node);
    };

    const restatesName = (lastLine: number, lines: readonly string[]): boolean => {
      if (lines.some((line) => line.startsWith('@'))) return false;
      const name = DECLARATION.exec(sourceCode.lines[lastLine] ?? '')?.[1];
      if (name === undefined) return false;
      const words = contentWords(lines.join(' '));
      const fromName = nameWords(name);
      return words.length > 0 && words.length <= 6 && words.every((word) => fromName.has(word));
    };

    /** The first problem with a comment, as a message id and its data. */
    const problem = (
      group: readonly Comment[],
      lines: readonly string[],
      exportDoc: boolean
    ): readonly [string, Record<string, string | number>?] | undefined => {
      const isLine = group[0]?.type === 'Line';
      const body = lines.join('\n');
      const prose = body.replace(URL, '');
      if (options.policy === 'tagged-only' && !exportDoc && !isTagged(lines[0] ?? '')) {
        return ['untagged', { prefixes }];
      }
      if (lines.some((line) => DIVIDER.test(line))) return ['divider'];
      if (isLine && lines.length === 1 && STEP_LABEL.test(body)) return ['stepLabel'];
      if (isLine && lines.every((line) => COMMENTED_CODE.test(line))) return ['commentedOutCode'];
      if (TASK_MARKER.test(body) && !TASK_LINK.test(body)) return ['untrackedTask'];
      const issues = new Set(prose.replace(CODE_SPAN, '').match(ISSUE) ?? []);
      if (issues.size > 1) return ['issueChain', { count: issues.size }];
      if (typescript && lines.some((line) => JSDOC_TYPE.test(line))) return ['jsdocType'];
      if (lines.some((line) => EMPTY_JSDOC_TAG.test(line))) return ['emptyJsdocTag'];
      if (restatesName(group.at(-1)?.loc.end.line ?? 0, lines)) return ['restatesName'];
      const words = body.split(/\s+/u).filter((word) => word !== '').length;
      const max = exportDoc ? options.maxExportDocWords : options.maxWords;
      if (words > max) return ['tooLong', { words, max }];
      for (const { pattern, message } of forbidden) {
        const match = pattern.exec(prose)?.[0];
        if (match !== undefined) return ['forbidden', { match, message }];
      }
      return undefined;
    };

    return {
      TSPropertySignature: collect,
      TSMethodSignature: collect,
      TSIndexSignature: collect,
      TSCallSignatureDeclaration: collect,
      TSConstructSignatureDeclaration: collect,
      TSEnumMember: collect,
      PropertyDefinition: collect,
      MethodDefinition: collect,
      Property: collect,
      'Program:exit'(program) {
        const exportDocs = new Set<number>();
        const addDoc = (node: ESTree.Node) => {
          const doc = docBefore(node, sourceCode);
          if (doc !== undefined) exportDocs.add(doc.start);
        };
        for (const statement of program.body) if (isExport(statement)) addDoc(statement);
        for (const member of members) if (isExposedMember(member)) addDoc(member);

        for (const group of commentGroups(sourceCode.getAllComments(), sourceCode.text)) {
          if (group.some((comment) => comment.value.startsWith('!') || LICENSE.test(comment.value))) continue;
          const lines = group.flatMap(textLines);
          const first = group[0];
          const last = group.at(-1);
          if (lines.length === 0 || first === undefined || last === undefined) continue;
          const found = problem(group, lines, group.length === 1 && exportDocs.has(first.start));
          if (found === undefined) continue;
          const [messageId, data] = found;
          context.report({ loc: { start: first.loc.start, end: last.loc.end }, messageId, data });
        }
      },
    };
  },
});
