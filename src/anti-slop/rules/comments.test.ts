import { RuleTester } from 'oxlint/plugins-dev';
import { commentsRule } from './comments.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const budget = [{ maxWords: 4, maxExportDocWords: 6 }];
const forbidden = [
  {
    forbidden: [{ pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b', message: 'Leave dates to git.' }],
  },
];
const taggedOnly = [{ policy: 'tagged-only' }];

tester.run('anti-slop/comments', commentsRule, {
  valid: [
    // The budget counts words in one comment, and adjacent `//` lines are one comment.
    { code: '// Four words of why.\nconst a = 1;', options: budget },
    { code: '/**\n * Four words\n * of why.\n */\nconst a = 1;', options: budget },
    { code: '// One two.\nconst a = 1;\n// Three four.\n// Five.\nconst b = 2;', options: budget },
    { code: '/** Six words on an export here. */\nexport const a = 1;', options: budget },
    // Directives and licence headers don't count.
    {
      code: '// oxlint-disable-next-line no-console -- a long reason here\n// Why.\nconst a = 1;',
      options: budget,
    },
    {
      code: '/*! Copyright 2026 Someone. Licensed under the MIT licence, see LICENSE. */\nconst a = 1;',
      options: budget,
    },
    '#!/usr/bin/env node\nconst a = 1;',
    // One issue may be cited; a URL is not an issue.
    '// Chosen in #12.\nconst a = 1;',
    '// Source: https://github.com/a/b/issues/34#issuecomment-1\nconst a = 1;',
    // A task marker with a link to what tracks it.
    '// TODO(#12): drop once the API returns ids.\nconst a = 1;',
    // A comment that adds to the name below it.
    '// Rounded down, because the API truncates.\nconst totalSeconds = 1;',
    // Prose that reads a little like code.
    '// Keep a = b here; the parser needs both.\nconst a = 1;',
    // A JSDoc tag with a description.
    '/** @param id the row to load, never a draft */\nfunction load(id: string) { return id; }',
    { code: '// Leave the default.\nconst a = 1;', options: forbidden },
    // tagged-only keeps directives, licence headers, the allowed prefixes and docs on exports.
    { code: '// SAFETY: the schema checked it.\nconst a = b as C;', options: taggedOnly },
    {
      code: '// WARNING: the vendor API returns\n// cents, not euros.\nconst a = 1;',
      options: taggedOnly,
    },
    { code: '// SYNC: keeps the URL in step.\nuseEffect(() => {});', options: taggedOnly },
    {
      code: '// @ts-expect-error -- the types lag the API\nconst a: string = 1;',
      options: taggedOnly,
    },
    { code: '/** A row id. */\nexport type Id = string;', options: taggedOnly },
    {
      code: 'export interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}',
      options: taggedOnly,
    },
    {
      code: 'export class Store {\n  /** Loads one row. */\n  load() {}\n}',
      options: taggedOnly,
    },
    {
      code: '// NOTE: kept for the old client.\nconst a = 1;',
      options: [{ policy: 'tagged-only', allow: ['NOTE'] }],
    },
    // Exports declared apart from their declaration (S1).
    { code: '/** Six words on an export here. */\nconst a = 1;\nexport { a };', options: budget },
    {
      code: '/** Loads one row. */\nfunction load() {}\nexport default load;',
      options: taggedOnly,
    },
    {
      code: 'interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}\nexport type { Row };',
      options: taggedOnly,
    },
    // Words such as "creates" and "new" add to a name, and a call is not a declaration (S3).
    '/** Creates a new user. */\nexport function user() {}',
    '// Flush pending writes.\nflushPendingWrites();',
    // A tag's description may continue on the next line (S4).
    '/**\n * @param id\n *   the row to load\n */\nfunction load(id: string) { return id; }',
    // A licence header at the top of a file (S5).
    {
      code: '// Copyright 2026 Someone. All rights reserved. Licensed under MIT, see LICENSE.\nconst a = 1;',
      options: budget,
    },
    // The reason above a suppression is what require-suppression-reason asks for (G1).
    {
      code: '// The CLI prints its result.\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      options: taggedOnly,
    },
  ],
  invalid: [
    {
      code: '// One two three four five.\nconst a = 1;',
      options: budget,
      errors: [{ messageId: 'tooLong' }],
    },
    {
      code: '// One two three.\n// Four five.\nconst a = 1;',
      options: budget,
      errors: [{ messageId: 'tooLong' }],
    },
    {
      code: '/** Five words, but not exported. */\nconst a = 1;',
      options: budget,
      errors: [{ messageId: 'tooLong' }],
    },
    {
      code: '/** Seven words here, even on an export. */\nexport const a = 1;',
      options: budget,
      errors: [{ messageId: 'tooLong' }],
    },
    { code: '// From #12, #34.\nconst a = 1;', errors: [{ messageId: 'issueChain' }] },
    {
      code: '// Changed on 2026-11-20.\nconst a = 1;',
      options: forbidden,
      errors: [{ messageId: 'forbidden' }],
    },
    { code: '// ---- Helpers ----\nconst a = 1;', errors: [{ messageId: 'divider' }] },
    { code: '// =========\nconst a = 1;', errors: [{ messageId: 'divider' }] },
    { code: '// ═══════\n// Time series\n// ═══════\nconst timeSeries = 1;', errors: [{ messageId: 'divider' }] },
    {
      code: '// const old = load();\n// save(old);\nconst a = 1;',
      errors: [{ messageId: 'commentedOutCode' }],
    },
    { code: '// Load the user.\nfunction loadUser() {}', errors: [{ messageId: 'restatesName' }] },
    {
      code: '// The total seconds\nconst totalSeconds = 1;',
      errors: [{ messageId: 'restatesName' }],
    },
    { code: '// TODO: handle errors\nconst a = 1;', errors: [{ messageId: 'untrackedTask' }] },
    {
      code: '/** @param {string} id the row */\nfunction load(id: string) { return id; }',
      errors: [{ messageId: 'jsdocType' }],
    },
    {
      code: '/**\n * Loads a row.\n * @returns\n */\nfunction load() {}',
      errors: [{ messageId: 'emptyJsdocTag' }],
    },
    {
      code: "test('x', () => {\n  // Arrange\n  const a = 1;\n});",
      errors: [{ messageId: 'stepLabel' }],
    },
    // tagged-only reports any other comment.
    {
      code: '// Because the API truncates.\nconst a = 1;',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: '/** Loads one row. */\nfunction load() {}',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: 'interface Row {\n  /** Seconds since the epoch. */\n  readonly at: number;\n}',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
    {
      code: '// SAFETY:\nconst a = b as C;',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
    // The budget still applies to an allowed comment.
    {
      code: '// SAFETY: one two three four.\nconst a = b as C;',
      options: [{ policy: 'tagged-only', maxWords: 4 }],
      errors: [{ messageId: 'tooLong' }],
    },
    // Inside an exported function's body is not the export's API (S2).
    {
      code: 'export const run = () => configure({ /** Why. */ debug: true });',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
    // "Copyright" in prose is not a licence header (S5).
    {
      code: 'const a = 1;\n// Respect the copyright of the feed.\nconst b = 2;',
      options: budget,
      errors: [{ messageId: 'tooLong' }],
    },
    // A directive ends a comment, so a tagged line above it can't carry the line below (S6).
    {
      code: '// SAFETY: fine.\n// oxlint-disable-next-line no-console -- logs\n// Unrelated chatter.\nconsole.log(1);',
      options: taggedOnly,
      errors: [{ messageId: 'untagged' }],
    },
  ],
});
