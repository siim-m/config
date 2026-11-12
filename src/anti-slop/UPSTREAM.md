# anti-slop provenance

Copied from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at `13909c9` (2026-10-13,
v0.1.2), MIT. `LICENSE` is upstream's. Files keep upstream's formatting, and `oxfmt.config.mts`
skips this directory, so a later diff against upstream shows only real changes.

## Deleted

| Upstream file                                    | Why                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `rules/no-shape-in-symbol-names.ts`              | Not wanted.                                                         |
| `rules/no-array-filter-map.ts`                   | Its fix makes code longer, and upstream doesn't claim it's faster. |
| `effect/rules/no-manual-tag-comparison.ts`       | Flags every `_tag` comparison; too broad to turn on.                |
| `effect/rules/no-manual-tagged-construction.ts`  | Flags every object literal with a `_tag`; too broad to turn on.     |

Their tests went with them. `shared/array-method.ts` and `effect/shared/tagged-values.ts` stay:
`no-reduce-accumulator-copy` and `no-manual-effect-error-tag` use them.

## Added

- `rules/require-pascal-case-namespace-imports.ts`
- `effect/rules/no-service-parameters.ts` and `effect/baseline.ts`, with `exempt` and `baseline`
  options.

- `react/`, the `anti-slop-react` plugin. Its rules come from
  [T3 Code](https://github.com/pingdotgg/t3code)'s `oxlint-plugin-t3code` at `2de3370`
  (2026-11-12), MIT; `react/LICENSE` is T3 Code's:
  - `no-manual-memo`, without T3's `allowMemoHooks` option, and without its message's pointer
    to T3's own `useStableCallback`.
  - `no-hookless-use-function`, rewritten to track hook calls through oxlint's traversal
    instead of walking each function's body.
  - `require-sync-comment-for-effect`, adapted from `no-unreasoned-state-sync`. T3 asks for a
    disable comment with a reason; this asks for a `SYNC:` comment, as
    `require-safety-comment-for-type-assertion` asks for `SAFETY:`, so it needs no rule that
    checks disable comments. It also checks test files.

## Changed upstream files

- `index.ts` and `effect/index.ts`: register the rules above, drop the deleted ones.
- `rules/require-readable-spacing-cli.test.ts`: runs this repo's oxlint binary instead of
  `pnpm exec oxlint`.

## Updating

1. Diff upstream from `13909c9` to the new revision, for example
   `git diff 13909c9 <rev> -- src/`, in a clone of upstream.
2. Apply the changes to the files kept here. Look at new rules before adding them; each one goes
   in `src/oxlint.ts` too, since the preset turns every rule on.
3. Run `bun run check`, then update the revision at the top of this file.
