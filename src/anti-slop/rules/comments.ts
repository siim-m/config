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
  /^(?:(?:oxlint|eslint)-(?:disable|enable|env)\b|eslint\s+[\w@/-]+\s*:|@ts-(?:expect-error|ignore|nocheck|check)\b|@effect-diagnostics|(?:prettier|oxfmt)-ignore|biome-ignore|svelte-ignore|(?:c8|v8|istanbul)\s+ignore|@(?:vitest|jest)-environment|@vite-ignore|webpack[A-Z]\w*:|@jsx|[@#]__(?:PURE|NO_SIDE_EFFECTS|INLINE|NOINLINE)__|\/\s*<(?:reference|amd-module|amd-dependency)\s|#\s*source(?:Mapping)?URL=|#(?:end)?region\b|nosemgrep\b)/u;
const LICENSE = /@license\b|\bSPDX-License-Identifier\b/u;
const COPYRIGHT = /\bcopyright\b/iu;
const SUPPRESSION = /^\s*\*?\s*(?:(?:oxlint|eslint)-disable|@ts-(?:expect-error|ignore|nocheck))/u;
const URL = /\bhttps?:\/\/\S+/gu;
const CODE_SPAN = /`[^`]*`/gu;
const ISSUE = /(?<![\w&/])#\d+\b(?![a-f])/giu;
const DIVIDER = /^(?:[-=*#~_/+\u2500-\u257F]{3,}(?:\s.*)?|.*[-=*#~_\u2500-\u257F]{3,})$/u;
const STEP_LABEL = /^(?:arrange|act|assert|given|when|then)\s*[:.]?$/iu;
const TASK_MARKER = /(?<!-)\b(?:TODO|FIXME|XXX|HACK)\b(?!-)/u;
/** A markdown heading, which a doc comment may use: `### Example`. */
const HEADING = /^#{1,6}\s+\S/u;
const TASK_LINK = /#\d+|\b[A-Z][A-Z\d]*-\d+\b|https?:\/\//u;
const JSDOC_TYPE = /^@(?:param|returns?|type|typedef)\s+\{/u;
const EMPTY_JSDOC_TAG = /^@(?:param(?:\s+\[?[\w$.]+\]?)?|returns?)$/u;
const COMMENTED_CODE =
  /^(?:(?:(?:const|let|var)\s+[\w${}[\], ]+=.*|import\s.+\sfrom\s+["'].+["']|(?:await\s+|return\s+)?[\w$.]+\(.*\)|[\w$.[\]]+\s*=\s*.+);|(?:if|for|while|switch)\s*\(.*\)\s*\{|\}(?:\s*else\s*\{)?)$/u;
const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const FILLER = new Set(
  'a an the of for to in on at by with from and or is are be this that it its as'.split(' ')
);

/** The words a comment or name carries once filler words go and plurals fold. */
const contentWords = (text: string): readonly string[] =>
  (text.toLowerCase().match(/[a-z0-9]+/gu) ?? [])
    .filter((word) => !FILLER.has(word))
    .map((word) => (word.length > 3 ? word.replace(/([^s])s$/u, '$1') : word))
    .filter((word) => !FILLER.has(word));

const nameWords = (name: string): ReadonlySet<string> =>
  new Set(
    contentWords(
      name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    )
  );

const isDoc = (comment: Comment): boolean =>
  comment.type === 'Block' && comment.value.startsWith('*');

/** A comment's lines of prose: no doc-comment stars, blank lines or directives. */
const textLines = (comment: Comment): readonly string[] => {
  const lines = comment.value
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/u, '').trim())
    .filter((line) => line !== '' && line !== '*');
  // A block that opens with a directive, such as a multi-line `oxlint-disable`, is all directive.
  if (comment.type === 'Block' && DIRECTIVE.test(lines[0] ?? '')) return [];
  return lines.filter((line) => !DIRECTIVE.test(line));
};

/** A comment that holds only directives, such as `// oxlint-disable-next-line rule -- reason`. */
const isDirective = (comment: Comment): boolean =>
  comment.value.trim() !== '' && textLines(comment).length === 0;

/** Adjacent `//` lines at one indent read as one comment; a directive stands alone. */
function commentGroups(
  comments: readonly Comment[],
  text: string
): readonly (readonly Comment[])[] {
  const groups: Comment[][] = [];
  for (const comment of comments) {
    if (comment.type === 'Shebang') continue;
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const continues =
      group !== undefined &&
      previous !== undefined &&
      !isDirective(previous) &&
      !isDirective(comment) &&
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
  while (comment !== undefined && !isDoc(comment) && textLines(comment).length === 0)
    comment = comments.pop();
  return comment !== undefined && isDoc(comment) ? comment : undefined;
}

const isExport = (node: ESTree.Node): boolean =>
  node.type === 'ExportNamedDeclaration' ||
  node.type === 'ExportDefaultDeclaration' ||
  node.type === 'ExportAllDeclaration';

/** Top-level statements that export, and declarations of a binding that `export { name }` or `export default name` exports. */
function exportedStatements(
  program: ESTree.Program,
  sourceCode: SourceCode
): ReadonlySet<ESTree.Node> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type === 'ExportNamedDeclaration' &&
      statement.declaration === null &&
      statement.source === null
    ) {
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === 'Identifier') names.add(specifier.local.name);
      }
    } else if (
      statement.type === 'ExportDefaultDeclaration' &&
      statement.declaration.type === 'Identifier'
    ) {
      names.add(statement.declaration.name);
    }
  }
  const exported = new Set<ESTree.Node>();
  for (const statement of program.body) {
    if (isExport(statement)) {
      exported.add(statement);
    } else if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        const declared = sourceCode.getDeclaredVariables(declarator);
        if (declared.some((variable) => names.has(variable.name))) exported.add(declarator);
      }
    } else if (
      'id' in statement &&
      statement.id?.type === 'Identifier' &&
      names.has(statement.id.name)
    ) {
      exported.add(statement);
    }
  }
  return exported;
}

/** The statement a doc comment for an exported node sits above. */
const docTarget = (node: ESTree.Node): ESTree.Node =>
  node.type === 'VariableDeclarator' && node.parent !== null ? node.parent : node;

/**
 * Whether a suppression directive follows a comment group on the next lines, past other
 * directives, so the group is its reason, as `require-suppression-reason` reads it.
 */
function suppressionFollows(
  groups: readonly (readonly Comment[])[],
  index: number,
  ownLine: (comment: Comment) => boolean
): boolean {
  let line = groups[index]?.at(-1)?.loc.end.line ?? 0;
  for (let next = index + 1; next < groups.length; next++) {
    const comment = groups[next]?.[0];
    if (comment === undefined || comment.loc.start.line !== line + 1 || !ownLine(comment)) {
      return false;
    }
    if (SUPPRESSION.test(comment.value)) return true;
    if (!isDirective(comment) && comment.value.replace(/[\s*]/gu, '') !== '') return false;
    line = comment.loc.end.line;
  }
  return false;
}

const FUNCTIONS: ReadonlySet<string> = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

/** Whether a member belongs to an exported declaration and is public: not in a function body, not private. */
function isExposedMember(member: ESTree.Node, exported: ReadonlySet<ESTree.Node>): boolean {
  let node: ESTree.Node = member;
  for (;;) {
    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') return false;
    if (
      'accessibility' in node &&
      (node.accessibility === 'private' || node.accessibility === 'protected')
    ) {
      return false;
    }
    if ('key' in node && node.key.type === 'PrivateIdentifier') return false;
    if (exported.has(node)) return true;
    const parent: ESTree.Node | null = node.parent;
    if (parent === null || parent.type === 'Program') return false;
    if (FUNCTIONS.has(parent.type) && 'body' in parent && parent.body === node) return false;
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
      description:
        'Hold comments to a short why, or with the tagged-only policy, to tagged comments and docs on exports.',
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
      {
        policy: 'budget',
        maxWords: 30,
        maxExportDocWords: 45,
        allow: ['SAFETY', 'SYNC', 'WARNING'],
        forbidden: [],
      },
    ],
    messages: {
      tooLong:
        "This comment has {{words}} words; the limit is {{max}}. Keep the why the code can't say, and leave the history to git and the PR.",
      issueChain:
        'This comment cites {{count}} issues. Cite the one that decided the code; git has the rest.',
      forbidden: 'This comment has `{{match}}` in it. {{message}}',
      divider:
        "Drop the section divider. Split the file, or let the code's structure show the grouping.",
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
    const forbidden = options.forbidden.map(({ pattern, message }) => ({
      pattern: new RegExp(pattern, 'u'),
      message,
    }));
    const isTagged = (line: string) =>
      options.allow.some(
        (prefix) => line.startsWith(`${prefix}:`) && line.slice(prefix.length + 1).trim() !== ''
      );
    const prefixes = options.allow.map((prefix) => `\`${prefix}:\``).join(', ');
    const members: ESTree.Node[] = [];
    /** Declarations and members by where they start, for the name a comment sits above. */
    const named = new Map<number, string>();
    const name = (node: ESTree.Node, id: ESTree.Node | null | undefined) => {
      if (id?.type === 'Identifier') named.set(node.start, id.name);
      else if (id?.type === 'Literal' && typeof id.value === 'string')
        named.set(node.start, id.value);
    };
    const collect = (node: ESTree.Node) => {
      members.push(node);
      if ('key' in node) name(node, node.key);
      else if ('id' in node) name(node, node.id);
    };
    const declaration = (node: ESTree.Node) => {
      if (node.type === 'VariableDeclaration') name(node, node.declarations[0]?.id);
      else if ('id' in node) name(node, node.id);
    };
    const exported = (node: ESTree.ExportNamedDeclaration | ESTree.ExportDefaultDeclaration) => {
      const inner = node.declaration;
      if (inner === null) return;
      if (inner.type === 'VariableDeclaration') name(node, inner.declarations[0]?.id);
      else if ('id' in inner) name(node, inner.id);
    };

    const restatesName = (last: Comment, lines: readonly string[]): boolean => {
      if (lines.some((line) => line.startsWith('@'))) return false;
      // A trailing comment belongs to the code before it on its line.
      const before = (sourceCode.lines[last.loc.start.line - 1] ?? '').slice(0, last.loc.start.column);
      if (before.trim() !== '') return false;
      const next = sourceCode.getTokenAfter(last);
      const name = next === null ? undefined : named.get(next.start);
      if (name === undefined) return false;
      const words = contentWords(lines.join(' '));
      const fromName = nameWords(name);
      return words.length > 0 && words.length <= 6 && words.every((word) => fromName.has(word));
    };

    /** The first problem with a comment, as a message id and its data. */
    const problem = (
      group: readonly Comment[],
      lines: readonly string[],
      exportDoc: boolean,
      explainsSuppression: boolean
    ): readonly [string, Record<string, string | number>?] | undefined => {
      const isLine = group[0]?.type === 'Line';
      const body = lines.join('\n');
      const prose = body.replace(URL, '');
      if (
        options.policy === 'tagged-only' &&
        !exportDoc &&
        !explainsSuppression &&
        !isTagged(lines[0] ?? '')
      ) {
        return ['untagged', { prefixes }];
      }
      if (lines.some((line) => DIVIDER.test(line) && (isLine || !HEADING.test(line))))
        return ['divider'];
      if (isLine && lines.length === 1 && STEP_LABEL.test(body)) return ['stepLabel'];
      if (isLine && lines.every((line) => COMMENTED_CODE.test(line))) return ['commentedOutCode'];
      if (TASK_MARKER.test(body) && !TASK_LINK.test(body)) return ['untrackedTask'];
      const issues = new Set(prose.replace(CODE_SPAN, '').match(ISSUE) ?? []);
      if (issues.size > 1) return ['issueChain', { count: issues.size }];
      if (typescript && lines.some((line) => JSDOC_TYPE.test(line))) return ['jsdocType'];
      const describedLater = (index: number) => (lines[index + 1] ?? '@').startsWith('@') === false;
      if (lines.some((line, index) => EMPTY_JSDOC_TAG.test(line) && !describedLater(index)))
        return ['emptyJsdocTag'];
      const last = group.at(-1);
      if (last !== undefined && restatesName(last, lines)) return ['restatesName'];
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
      VariableDeclaration: declaration,
      FunctionDeclaration: declaration,
      ClassDeclaration: declaration,
      TSDeclareFunction: declaration,
      TSInterfaceDeclaration: declaration,
      TSTypeAliasDeclaration: declaration,
      TSEnumDeclaration: declaration,
      ExportNamedDeclaration: exported,
      ExportDefaultDeclaration: exported,
      'Program:exit'(program) {
        const exportedNodes = exportedStatements(program, sourceCode);
        const exportDocs = new Set<number>();
        const addDoc = (node: ESTree.Node) => {
          const doc = docBefore(node, sourceCode);
          if (doc !== undefined) exportDocs.add(doc.start);
        };
        for (const node of exportedNodes) addDoc(docTarget(node));
        for (const member of members) if (isExposedMember(member, exportedNodes)) addDoc(member);
        const codeStart = program.body[0]?.start ?? sourceCode.text.length;

        const groups = commentGroups(sourceCode.getAllComments(), sourceCode.text);
        const ownLine = (comment: Comment) =>
          (sourceCode.lines[comment.loc.start.line - 1] ?? '')
            .slice(0, comment.loc.start.column)
            .trim() === '';
        for (const [index, group] of groups.entries()) {
          const first = group[0];
          const last = group.at(-1);
          if (first === undefined || last === undefined) continue;
          const licence =
            first.value.startsWith('!') ||
            group.some((comment) => LICENSE.test(comment.value)) ||
            (last.end <= codeStart && group.some((comment) => COPYRIGHT.test(comment.value)));
          const lines = group.flatMap(textLines);
          if (licence || lines.length === 0) continue;
          const explainsSuppression =
            options.policy === 'tagged-only' &&
            ownLine(first) &&
            suppressionFollows(groups, index, ownLine);
          const found = problem(
            group,
            lines,
            group.length === 1 && exportDocs.has(first.start),
            explainsSuppression
          );
          if (found === undefined) continue;
          const [messageId, data] = found;
          context.report({ loc: { start: first.loc.start, end: last.loc.end }, messageId, data });
        }
      },
    };
  },
});
