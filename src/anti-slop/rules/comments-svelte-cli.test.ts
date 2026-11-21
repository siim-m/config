/// <reference types="node" />

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// RuleTester can't parse a `.svelte` file, so these lint real components with this repo's oxlint.
const oxlint = fileURLToPath(new URL('../../../node_modules/.bin/oxlint', import.meta.url));
const plugin = fileURLToPath(new URL('../index.ts', import.meta.url));

/** The lines oxlint reports `anti-slop/comments` on in a component with this source. */
function reportedLines(component: string): readonly number[] {
  const root = mkdtempSync(join(tmpdir(), 'anti-slop-comments-svelte-'));
  try {
    const config = join(root, 'oxlint.json');
    writeFileSync(
      config,
      JSON.stringify({
        jsPlugins: [{ name: 'anti-slop', specifier: plugin }],
        rules: { 'anti-slop/comments': 'error' },
      })
    );
    writeFileSync(join(root, 'Card.svelte'), component);
    const result = spawnSync(oxlint, ['--format=unix', '--config', config, root], {
      encoding: 'utf8',
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.ok(result.status === 0 || result.status === 1, output);
    return [...output.matchAll(/Card\.svelte:(\d+):\d+: .*comments/gu)].map(([, line]) =>
      Number(line)
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("docs on the props type a component's $props() names stay", () => {
  const component = `<!-- @component Shows a card with a title. -->
<script lang="ts">
  interface Props {
    /** The card's heading. */
    title: string;
  }
  let { title }: Props = $props();
</script>

<h1>{title}</h1>
`;
  assert.deepEqual(reportedLines(component), []);
});

test('docs on an inline $props() type stay', () => {
  const component = `<script lang="ts">
  let {
    title,
  }: {
    /** The card's heading. */
    title: string;
  } = $props();
</script>
`;
  assert.deepEqual(reportedLines(component), []);
});

test('docs on a props type alias, or an intersection with other props, stay', () => {
  const component = `<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  type Props = {
    /** The card's heading. */
    title: string;
  };
  let { title, ...rest }: Props & HTMLButtonAttributes = $props();
</script>
`;
  assert.deepEqual(reportedLines(component), []);
});

test('docs on props exported from the module script stay; oxlint reads each script on its own', () => {
  const component = `<script lang="ts" module>
  export interface Props {
    /** The card's heading. */
    title: string;
  }
</script>

<script lang="ts">
  let { title }: Props = $props();
</script>
`;
  assert.deepEqual(reportedLines(component), []);
});

test("a component's script doc and docs on other types are reported", () => {
  const component = `<script lang="ts">
  interface Row {
    /** Hidden. */
    id: string;
  }
  /** Shows a card. */
  let { title }: { title: string } = $props();
</script>
`;
  assert.deepEqual(reportedLines(component), [3, 6]);
});
