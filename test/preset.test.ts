import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The fixture consumes the built package by name, the way a repo does, so run `bun run build`
// first (`bun run test` does).
const root = fileURLToPath(new URL('..', import.meta.url));

function run(tool: string, args: readonly string[]): { status: number | null; output: string } {
  const bin = fileURLToPath(new URL(`../node_modules/.bin/${tool}`, import.meta.url));
  const result = spawnSync(bin, args, { cwd: root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The rules oxlint's unix format reports for each file, as `plugin(rule)`. */
function reportedRules(output: string): ReadonlyMap<string, readonly string[]> {
  const rules = new Map<string, string[]>();
  for (const [, file = '', rule = ''] of output.matchAll(/^(.+?):\d+:\d+: .*\[\w+\/(.+)\]$/gm)) {
    rules.set(file, [...(rules.get(file) ?? []), rule].sort());
  }
  return rules;
}

test('the oxlint preset loads its plugins and reports one hit per rule in the fixture', () => {
  const { status, output } = run('oxlint', [
    '--type-aware',
    '--format=unix',
    '-c',
    'test/fixture/oxlint.config.mts',
    'test/fixture/violations.ts',
    'test/fixture/clean.ts',
  ]);

  assert.equal(status, 1, output);
  const rules = reportedRules(output);
  // anti-slop/no-reflect-get is missing: the fixture's config turns it off.
  assert.deepEqual(
    rules.get('test/fixture/violations.ts'),
    [
      'anti-slop(no-unknown-parameters)',
      'anti-slop(require-pascal-case-namespace-imports)',
      'anti-slop(require-readable-spacing)',
      'anti-slop-effect(prefer-effect-match)',
      'eslint(no-debugger)',
      'typescript(no-floating-promises)',
      'typescript(no-misused-promises)',
    ],
    output
  );
  assert.equal(rules.has('test/fixture/clean.ts'), false, output);
});

test('the oxfmt settings load', () => {
  // clean.ts uses single quotes, which oxfmt's defaults would rewrite.
  const { status, output } = run('oxfmt', [
    '--check',
    '-c',
    'test/fixture/oxfmt.fixture.mts',
    'test/fixture/clean.ts',
  ]);

  assert.equal(status, 0, output);
});

test('the tsconfig base and ts-reset apply', () => {
  const { output } = run('tsc', ['-p', 'test/fixture/tsconfig.json']);
  const errors = output.split('\n').filter((line) => line.includes('error TS'));

  assert.deepEqual(
    errors.map((line) => line.replace(/\(.*$/, '')),
    ['test/fixture/reset-check.ts', 'test/fixture/strict-check.ts'],
    output
  );
});
