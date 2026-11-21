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
- `rules/require-suppression-reason.ts`, adapted from T3 Code's rule of that name (MIT, T3 Tools
  Inc.).
- `effect/rules/no-service-parameters.ts` and `effect/baseline.ts`, with `exempt` and `baseline`
  options.
- `effect/rules/no-ordie.ts`, which replaced the fork's `no-ordie-in-service-construction`: it
  reports `orDie` everywhere outside tests, not only while a service is built, and a catch-all
  handler that only dies.

## From Kyle Mistele's fork

Copied, with their tests, from [K-Mistele/anti-slop](https://github.com/K-Mistele/anti-slop) at
`13b0203` (2026-11-19), MIT. Unchanged except where "Changed" says:

- `rules/no-disabled-type-assertion-rules.ts`. Changed: a built-in rule named under any prefix
  or none, such as `ts/no-unsafe-type-assertion`, counts, since oxlint matches built-in rules by
  name; the rule list ends at ` --` even with no space before the reason; and spaces or newlines
  separate rule names as commas do.
- `effect/rules/no-unbounded-retry.ts`, ported there from cevr/effect-oxlint (MIT, which ships no
  copyright notice). Changed:
  - reads Effect 4's array form `Schedule.max([a, b])` and `Schedule.min([a, b])`;
  - reads a schedule defined in terms of itself, a destructured binding, or a schedule passed
    through a combinator it doesn't know, such as `Schedule.while`, as unknown;
  - treats `times: undefined` as no limit, and reports options with no `schedule` and no `times`,
    which retry on `Schedule.forever`;
  - reads `Schedule.concatResult` like `concat`;
  - says "no limit on attempts or time" rather than "never gives up".
- `effect/rules/require-cause-when-narrowing.ts`. Changed: a data-first source built with
  `.pipe(Effect.tapError(...))` counts as logged; neither a yielded value bound to a name, such as
  `const ref = yield* Ref.make(0)`, nor the `make` of an Effect value module, such as
  `Ref.make(0)` or `Queue.make()`, is a constructed error; and the message names `A.B` for
  `new A.B(...)`.
- `effect/rules/throw-in-effect-gen.ts`, ported there from mpsuesser/enfect (MIT, notice in
  `effect/LICENSE-enfect`).
- `effect/shared/effect-modules.ts`, which these rules and `no-ordie` share. `serviceClass` and a few
  other helpers have no caller since `no-ordie-in-service-construction` went; they stay so the file
  still diffs cleanly against the fork.

To update them, diff those files in the fork from `13b0203`.

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
