import { defineRule } from '@oxlint/plugins';
import type { Comment, ESTree, SourceCode } from '@oxlint/plugins';

interface Options {
  readonly maxWords: number;
  readonly multilineExportDocs: boolean;
  readonly allow: readonly string[];
}

const DIRECTIVE =
  /^(?:(?:oxlint|eslint)-(?:disable|enable|env)\b|eslint\s+[\w@/-]+\s*:\s*(?:off|warn|error|[012]|\[)|@ts-(?:expect-error|ignore|nocheck|check)\b|@effect-diagnostics|(?:prettier|oxfmt)-ignore|biome-ignore|svelte-ignore|(?:c8|v8|istanbul)\s+ignore|@(?:vitest|jest)-environment|@vite-ignore|webpack[A-Z]\w*:|@jsx|[@#]__(?:PURE|NO_SIDE_EFFECTS|INLINE|NOINLINE)__|\/\s*<(?:reference|amd-module|amd-dependency)\s|#\s*source(?:Mapping)?URL=|#(?:end)?region\b|nosemgrep\b)/u;
const LICENSE = /@license\b|\bSPDX-License-Identifier\b/u;
const COPYRIGHT = /\bcopyright\b/iu;
const SUPPRESSION =
  /^\s*\*?\s*(?:(?:oxlint|eslint)-disable|@ts-(?:expect-error|ignore|nocheck)|@effect-diagnostics(?:-next-line)?\s.*:(?:off|skip-file)\b|svelte-ignore\b)/u;
/** A one-word block comment before a template literal, such as `glsl`, that tells editors how to highlight it. */
const LANGUAGE_HINT = /^\s*[a-z][\w-]*\s*$/iu;
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

/**
 * The doc comment directly above a node, looking past directives such as `oxlint-disable-next-line`
 * and, for a union variant, past the `|` in front of it.
 */
function docBefore(node: ESTree.Node, sourceCode: SourceCode): Comment | undefined {
  let comments = sourceCode.getCommentsBefore(node);
  const token = sourceCode.getTokenBefore(node);
  if (comments.length === 0 && node.parent?.type === 'TSUnionType' && token?.value === '|') {
    comments = sourceCode.getCommentsBefore(token);
  }
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

/**
 * In a Svelte component, the type its `$props()` call declares, inline or as a local interface or
 * type alias: the component's API, whose member docs editors show to callers.
 */
function svelteProps(program: ESTree.Program, filename: string): readonly ESTree.Node[] {
  if (!filename.endsWith('.svelte')) return [];
  const types = new Map<string, ESTree.Node>();
  for (const statement of program.body) {
    if (statement.type === 'TSInterfaceDeclaration' || statement.type === 'TSTypeAliasDeclaration')
      types.set(statement.id.name, statement);
  }
  const props: ESTree.Node[] = [];
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const { id, init } of statement.declarations) {
      const callsProps =
        init?.type === 'CallExpression' &&
        init.callee.type === 'Identifier' &&
        init.callee.name === '$props';
      const type = id.typeAnnotation?.typeAnnotation;
      if (!callsProps || type === undefined) continue;
      if (type.type === 'TSTypeLiteral') props.push(type);
      if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
        const declaration = types.get(type.typeName.name);
        if (declaration !== undefined) props.push(declaration);
      }
    }
  }
  return props;
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
    if (comment === undefined || comment.loc.start.line !== line + 1) return false;
    // A reason may sit above a line that ends in `// oxlint-disable-line rule`.
    if (!ownLine(comment)) return SUPPRESSION.test(comment.value);
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
 * Keep only comments that carry what the code can't: directives, licence headers, docs on exports,
 * the reason above a suppression and comments that start with an allowed prefix such as `SAFETY:`.
 * Each gets one line and a word limit.
 */
export const commentsRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Keep only tagged comments, docs on exports and suppression reasons, each on one line.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxWords: { type: 'integer', minimum: 1 },
          multilineExportDocs: { type: 'boolean' },
          allow: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        maxWords: 30,
        multilineExportDocs: false,
        allow: ['SAFETY', 'SYNC', 'WARNING'],
      },
    ],
    messages: {
      untagged:
        'Remove this comment: put the meaning in names and the rationale in the PR. Comments that start with {{prefixes}}, directives, docs on exports and the reason above a suppression stay.',
      multiLine: 'Keep this comment to one line. Leave the history to git and the PR.',
      multiLineDoc:
        'Keep this doc to one line. A file whose exports need longer docs sets `multilineExportDocs` in an override.',
      tooLong: 'This comment has {{words}} words; the limit is {{max}}.',
    },
  },
  create(context) {
    // SAFETY: oxlint validates the options against the schema above and fills in defaultOptions.
    const [options] = context.options as unknown as readonly [Options];
    const { sourceCode } = context;
    const isTagged = (line: string) =>
      options.allow.some(
        (prefix) => line.startsWith(`${prefix}:`) && line.slice(prefix.length + 1).trim() !== ''
      );
    const prefixes = options.allow.map((prefix) => `\`${prefix}:\``).join(', ');
    const members: ESTree.Node[] = [];
    const templates = new Set<number>();
    const collect = (node: ESTree.Node) => {
      members.push(node);
    };

    /** The first problem with a comment, as a message id and its data. */
    const problem = (
      lines: readonly string[],
      kind: 'exportDoc' | 'reason' | 'other'
    ): readonly [string, Record<string, string | number>?] | undefined => {
      if (kind === 'other' && !isTagged(lines[0] ?? '')) return ['untagged', { prefixes }];
      const exempt = kind === 'exportDoc' && options.multilineExportDocs;
      if (!exempt) {
        if (lines.length > 1) return [kind === 'exportDoc' ? 'multiLineDoc' : 'multiLine'];
        const words = lines.join(' ').split(/\s+/u).filter((word) => word !== '').length;
        if (words > options.maxWords) return ['tooLong', { words, max: options.maxWords }];
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
      TemplateLiteral(node) {
        templates.add(node.start);
      },
      TSUnionType(node) {
        members.push(...node.types);
      },
      'Program:exit'(program) {
        const exportedNodes = exportedStatements(program, sourceCode);
        /** Where each export doc starts. */
        const exportDocs = new Set<number>();
        const addDoc = (target: ESTree.Node) => {
          const doc = docBefore(target, sourceCode);
          if (doc !== undefined) exportDocs.add(doc.start);
        };
        for (const node of exportedNodes) addDoc(docTarget(node));
        const exposed = new Set([...exportedNodes, ...svelteProps(program, context.filename)]);
        for (const member of members) if (isExposedMember(member, exposed)) addDoc(member);
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
          const languageHint =
            group.length === 1 &&
            first.type === 'Block' &&
            !isDoc(first) &&
            LANGUAGE_HINT.test(first.value) &&
            templates.has(sourceCode.getTokenAfter(first)?.start ?? -1);
          if (languageHint) continue;
          const kind = exportDocs.has(first.start)
            ? 'exportDoc'
            : ownLine(first) && suppressionFollows(groups, index, ownLine)
              ? 'reason'
              : 'other';
          const found = problem(lines, kind);
          if (found === undefined) continue;
          const [messageId, data] = found;
          context.report({ loc: { start: first.loc.start, end: last.loc.end }, messageId, data });
        }
      },
    };
  },
});
