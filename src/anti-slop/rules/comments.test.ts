import { RuleTester } from 'oxlint/plugins-dev';
import { commentsRule } from './comments.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const multilineDocs = [{ multilineExportDocs: true }];

tester.run('anti-slop/comments', commentsRule, {
  valid: [
    // The allowed prefixes, directives and licence headers stay.
    '// SAFETY: the schema checked it.\nconst a = b as C;',
    '// SYNC: keeps the URL in step.\nuseEffect(() => {});',
    '// WARNING: the vendor API returns cents.\nconst a = 1;',
    { code: '// NOTE: kept for the old client.\nconst a = 1;', options: [{ allow: ['NOTE'] }] },
    '// @ts-expect-error -- the types lag the API\nconst a: string = 1;',
    '// oxlint-disable-next-line no-console -- a long reason here\nconsole.log(1);',
    '/*! Copyright 2026 Someone. Licensed under the MIT licence, see LICENSE. */\nconst a = 1;',
    '// Copyright 2026 Someone. All rights reserved. Licensed under MIT, see LICENSE.\nconst a = 1;',
    '#!/usr/bin/env node\nconst a = 1;',
    // A one-word language hint before a template literal tells editors how to highlight it.
    'const shader = /* glsl */ `void main() {}`;',
    'const view = /*html*/`<p></p>`;',
    'const query =\n  /* sql */\n  `select 1`;',
    // Issue numbers are fine in a comment that stays.
    '// WARNING: #12 and #34 both depend on this order.\nconst a = 1;',
    // Docs on exports stay, including members of an exported type.
    '/** A row id. */\nexport type Id = string;',
    '/**\n * A row id.\n */\nexport type Id = string;',
    'export interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}',
    'export class Store {\n  /** Loads one row. */\n  load() {}\n}',
    '/** Creates a new user. */\nexport function user() {}',
    // A variant of an exported union is part of its shape, with the doc before or after the `|`.
    'export type Phase = /** Idle. */ "idle" | /** Running. */ "running";',
    'export type Command =\n  /** Moves a corner. */\n  | { readonly _tag: "Move"; /** The corner. */ readonly index: number }\n  /** Removes a corner. */\n  | { readonly _tag: "Remove" };',
    'export interface Pack {\n  readonly callout:\n    | /** A note. */ { readonly kind: "note" }\n    | { readonly kind: "none" };\n}',
    // Exports declared apart from their declaration.
    '/** Loads one row. */\nfunction load() {}\nexport default load;',
    'interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}\nexport type { Row };',
    '/** The API. */\nconst { api } = source;\nexport { api };',
    // multilineExportDocs lets an export's doc run to more lines and words.
    {
      code: '/**\n * Loads one row.\n *\n * @param id the row to load, never a draft\n */\nexport function load(id: string) { return id; }',
      options: multilineDocs,
    },
    // The rule doesn't judge what an export's doc says, so one that repeats the name stays.
    '/** Load the user. */\nexport function loadUser() {}',
    // The reason above a suppression is what require-suppression-reason asks for.
    '// The CLI prints its result.\n// oxlint-disable-next-line no-console\nconsole.log(1);',
    '// The CLI prints its result.\n// prettier-ignore\n// oxlint-disable-next-line no-console\nconsole.log(1);',
    '// The CLI prints its result.\n/**/\n// oxlint-disable-next-line no-console\nconsole.log(1);',
    '// The CLI prints its result.\nconsole.log(1); // oxlint-disable-line no-console',
    '// Scripts print.\n/* oxlint-disable\n   no-console */\nconsole.log(1);',
    // Effect's and Svelte's suppressions take a reason above them too.
    '// The worker reads its files directly.\n// @effect-diagnostics-next-line nodeBuiltinImport:off\nimport * as Fs from "node:fs";',
    '// This module wraps Node.\n// @effect-diagnostics nodeBuiltinImport:off globalConsole:off\nimport * as Fs from "node:fs";',
    '// Generated from the schema.\n// @effect-diagnostics *:skip-file\nexport const a = 1;',
    '// Wraps Node.\n// @effect-diagnostics nodeBuiltinImport:OFF\nimport * as Fs from "node:fs";',
    '// Read once on purpose.\n// svelte-ignore state_referenced_locally\nconst t = title;',
  ],
  invalid: [
    // Any other comment goes.
    { code: '// Because the API truncates.\nconst a = 1;', errors: [{ messageId: 'untagged' }] },
    { code: '/** Loads one row. */\nfunction load() {}', errors: [{ messageId: 'untagged' }] },
    { code: '// TODO(#12): drop the shim.\nconst a = 1;', errors: [{ messageId: 'untagged' }] },
    // The message says what each default prefix is for and lists a custom one by name.
    {
      code: '// The plan and the 3D view share these colours.\nconst a = 1;',
      errors: [
        {
          message:
            "Remove this comment: put the meaning in names and the rationale in the PR. Directives, docs on exports, the reason above a suppression and comments that start with one of these prefixes stay: `SAFETY:` why an unchecked step such as a type assertion holds; `SYNC:` the other place or outside system this code must stay in step with; `WARNING:` a trap the next change could fall into. Adding a prefix that doesn't fit is not a fix.",
        },
      ],
    },
    {
      code: '// The plan and the 3D view share these colours.\nconst a = 1;',
      options: [{ allow: ['SYNC', 'NOTE'] }],
      errors: [
        {
          message:
            "Remove this comment: put the meaning in names and the rationale in the PR. Directives, docs on exports, the reason above a suppression and comments that start with one of these prefixes stay: `SYNC:` the other place or outside system this code must stay in step with; `NOTE:`. Adding a prefix that doesn't fit is not a fix.",
        },
      ],
    },
    {
      code: 'interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}',
      errors: [{ messageId: 'untagged' }],
    },
    { code: '// SAFETY:\nconst a = b as C;', errors: [{ messageId: 'untagged' }] },
    // A union that isn't exported, or that sits in an exported function's body, documents nothing public.
    {
      code: 'type Phase =\n  /** Idle. */\n  | "idle"\n  | "running";',
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: 'export function f() {\n  type T = /** Hidden. */ "a" | "b";\n}',
      errors: [{ messageId: 'untagged' }],
    },
    // Outside a Svelte component, a `$props()` type is a local type; see comments-svelte-cli.test.ts.
    {
      code: "interface Props {\n  /** The card's heading. */\n  title: string;\n}\nlet { title }: Props = $props();",
      errors: [{ messageId: 'untagged' }],
    },
    // Inside an exported function's body is not the export's API.
    {
      code: 'export const run = () => configure({ /** Why. */ debug: true });',
      errors: [{ messageId: 'untagged' }],
    },
    // Exporting a parameter's namesake or a sibling binding exports nothing else.
    {
      code: '/** Waits. */\nfunction delay(retries: number) { return retries; }\nconst retries = 1;\nexport { retries };',
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: 'const a = {}, b = {\n  /** Hidden. */\n  c: 1,\n};\nexport { a };',
      errors: [{ messageId: 'untagged' }],
    },
    // "Copyright" in prose after the code starts is not a licence header.
    {
      code: 'const a = 1;\n// Respect the copyright of the feed.\nconst b = 2;',
      errors: [{ messageId: 'untagged' }],
    },
    // Anything more than that is a comment.
    { code: 'const shader = /* glsl shader */ `void main() {}`;', errors: [{ messageId: 'untagged' }] },
    { code: 'const shader = /** glsl */ `void main() {}`;', errors: [{ messageId: 'untagged' }] },
    { code: 'const shader = // glsl\n  `void main() {}`;', errors: [{ messageId: 'untagged' }] },
    { code: '/* glsl */ const a = 1;', errors: [{ messageId: 'untagged' }] },
    { code: 'const shader = /* glsl */ glsl`void main() {}`;', errors: [{ messageId: 'untagged' }] },
    { code: 'const shader = String.raw /* glsl */ `void main() {}`;', errors: [{ messageId: 'untagged' }] },
    { code: 'const shader = /* scratch */ /* glsl */ `void main() {}`;', errors: [{ messageId: 'untagged' }] },
    // Prose that starts with a tool's name is not a directive.
    { code: '// eslint config: the base preset sets these.\nconst a = 1;', errors: [{ messageId: 'untagged' }] },
    // A directive ends a comment, so a tagged line above it can't carry the line below.
    {
      code: '// SAFETY: fine.\n// oxlint-disable-next-line no-console -- logs\n// Unrelated chatter.\nconsole.log(1);',
      errors: [{ messageId: 'untagged' }],
    },
    // An Effect directive that turns a check up suppresses nothing.
    {
      code: '// The loop must not leak.\n// @effect-diagnostics floatingEffect:error\nconst a = 1;',
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: '// Wraps Node.\n// @effect-diagnostics nodeBuiltinImport:off-label\nconst a = 1;',
      errors: [{ messageId: 'untagged' }],
    },
    // A trailing comment is not a reason, and a trailing directive doesn't carry one down.
    {
      code: 'start(); // Starts it.\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: '// Starts it.\nstart(); // prettier-ignore\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [{ messageId: 'untagged' }],
    },
    // A comment that stays gets one line.
    {
      code: '// WARNING: the vendor API returns\n// cents, not euros.\nconst a = 1;',
      errors: [{ messageId: 'multiLine' }],
    },
    {
      code: '/* SAFETY: the schema\n   checked it. */\nconst a = b as C;',
      errors: [{ messageId: 'multiLine' }],
    },
    {
      code: '// The CLI prints\n// its result.\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [{ messageId: 'multiLine' }],
    },
    {
      code: '/**\n * Loads one row.\n *\n * @param id the row to load\n */\nexport function load(id: string) { return id; }',
      errors: [{ messageId: 'multiLineDoc' }],
    },
    // And a word limit, since a formatter doesn't wrap comments.
    {
      code: '// SAFETY: one two three four.\nconst a = b as C;',
      options: [{ maxWords: 4 }],
      errors: [{ messageId: 'tooLong' }],
    },
    {
      code: '/** One two three four five. */\nexport const a = 1;',
      options: [{ maxWords: 4 }],
      errors: [{ messageId: 'tooLong' }],
    },
  ],
});
