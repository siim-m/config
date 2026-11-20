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
- `rules/comments.ts`, from the author's own `comment-budget` rule, with checks adapted from T3 Code's
  `no-low-value-comments` (MIT, T3 Tools Inc.; see `../anti-slop-react/LICENSE`).
- `effect/rules/no-service-parameters.ts` and `effect/baseline.ts`, with `exempt` and `baseline`
  options.

## From Kyle Mistele's fork

Copied unchanged, with their tests, from [K-Mistele/anti-slop](https://github.com/K-Mistele/anti-slop)
at `13b0203` (2026-11-19), MIT:

- `effect/rules/no-ordie-in-service-construction.ts`
- `effect/rules/no-unbounded-retry.ts`, ported there from cevr/effect-oxlint (MIT).
- `effect/rules/require-cause-when-narrowing.ts`
- `effect/rules/throw-in-effect-gen.ts`, ported there from mpsuesser/enfect (MIT).
- `effect/shared/effect-modules.ts`, which the four rules share.

To update them, diff the fork's `src/effect/` from `13b0203`.

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
