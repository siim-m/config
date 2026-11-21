# @siim-m/config

Shared oxlint, oxfmt and tsconfig settings for TypeScript, with the
[anti-slop](https://github.com/dmmulroy/anti-slop) oxlint rules.

```sh
bun add -d @siim-m/config oxlint tsrs oxfmt
```

```ts
// oxlint.config.mts
import base from '@siim-m/config/oxlint';
import { defineConfig } from 'oxlint';

export default defineConfig({ extends: [base], rules: { 'anti-slop/no-runtime-typeof': 'off' } });

// oxfmt.config.mts
import base from '@siim-m/config/oxfmt';

export default { ...base, singleQuote: false };
```

```json
{ "extends": "@siim-m/config/tsconfig.json" }
```

It needs Node 22.18 or later in 22, or 24.11 or later. Every rule is on at `error`; a project turns
off what it can't pass yet. Run oxlint with `--type-aware`, which uses
[tsrs](https://github.com/oxc-project/tsrs), the Rust port of TypeScript 7 (in beta), when it's
installed, or `oxlint-tsgolint` in its place. Either one only backs the lint rules, so keep the
project's own `tsc` or `@effect/tsgo` typecheck. For ts-reset's stricter built-in types, add
`import '@siim-m/config/reset.d.ts';` to a `.d.ts` file in the project.

A disable comment or `@ts-expect-error` must say why: after `--` (or, for a `@ts-` directive,
anywhere after it in the same comment), or on the line above
(`anti-slop/require-suppression-reason`). The type-assertion rules can't be disabled inline at all;
turn one off for a file in the lint config instead (`anti-slop/no-disabled-type-assertion-rules`). A
file-wide or same-line disable that names no rule, or that names one of these two checks, silences
them too, and oxlint gives a rule no way to report that, so catch one in review.

## Comments

`anti-slop/comments` keeps only the comments the code can't replace: directives, licence headers,
doc comments on exports, the reason above a suppression and comments that start with an `allow`
prefix. Each gets one line of at most 30 words (`maxWords`). The prefixes default to `SAFETY`,
`SYNC` and `WARNING`. An `allow` list replaces them, so keep `SAFETY` and `SYNC` in it: the
type-assertion and React effect rules ask for those.

A doc on part of an export's API counts as an export doc: a member of an exported type or class, a
variant of an exported union, and in a `.svelte` file a member of the props type that `$props()`
names. oxlint reads each `<script>` block on its own, so declare that type in the same block as
`$props()`, or export it from `<script module>`. Document the component itself in a
`<!-- @component -->` comment in the markup, which oxlint doesn't read. A suppression is an
`oxlint-disable` or `eslint-disable` comment, a `@ts-` directive, an `@effect-diagnostics` directive
that turns a check `off` or `skip-file`, or `svelte-ignore`. A one-word language hint for editors
before a template literal, such as `/* glsl */`, stays too.

A file whose exports need longer docs, such as a library's public API, turns on
`multilineExportDocs` in an override. The override replaces the rule's options, so repeat any others
you set:

```ts
overrides: [
  { files: ['src/api.ts'], rules: { 'anti-slop/comments': ['error', { multilineExportDocs: true }] } },
],
```

## Effect

`anti-slop-effect/no-ordie` reports `Effect.orDie`, `Stream.orDie`, `Layer.orDie` and a `catch`
whose handler only dies. Each one turns every error in the channel into a defect, including errors
added to it later, and the types don't show it. Die only on the errors you mean, with
`Effect.catchTag('ConfigMissing', Effect.die)` or `catchTags`, so a new error stays in the error
type. The preset turns the rule off in test files, where a broken fixture may stop the run, and the
tsconfig turns off the language service's `catchDieToOrDie`, which would ask for `orDie` in place of
such a catch. The rule replaces `no-ordie-in-service-construction` from 0.5.0; oxlint won't load a
config that still names the old rule, so rename or remove it there.

`anti-slop-effect/no-service-parameters` reports a function parameter typed as a service, such as
`(mailer: MailerShape, to: string) => mailer.send(to)`. Get the service from context where the
caller is built instead. A function may still take a service's shape when the file shows it's plain
data, such as a signed-in user built from `Schema.Struct` or `Schema.Class`, with no methods or
members typed as functions, Effects, Streams or Refs. A shape the rule can't see into, such as
`Effect.Success<typeof make>`, stays a service, and an imported shape counts when it's named
`…Shape`. List services that callers may pass along anyway, such as request context, in `exempt`.

## Tests and shortcuts

Ten rules from two npm packages report tests that pass whatever the code does or lean on time, and
other shortcuts agents take:

- From [eslint-plugin-ai-guard](https://github.com/ai-guard-dev/eslint-plugin-ai-guard):
  `no-assertionless-test`, `no-tautological-assertion`, `no-placeholder-implementation`,
  `no-test-env-branch`, `no-silent-fallback` and `no-undeclared-import`. Its test detection doesn't
  know Effect's `it.effect`, so those tests go unchecked. It brings `eslint` and typescript-eslint,
  which ask for TypeScript 6 as a peer; npm nests a copy under this package when the project has
  TypeScript 7.
- From [landmines](https://github.com/interfere-inc/landmines): `no-fixed-sleep`,
  `no-flake-masking`, `no-unsignaled-poll` and `strict-msw`. All four take an
  `allow: { "<file>": <count> }` option for adopting them file by file.

Both plugins load whole, so their other rules are there to turn on, such as landmines'
`no-test-doubles`, which bans `vi.fn(impl)` and other replaced behaviour in tests.

## React

For React code that the React Compiler compiles, extend the React preset after the base one:

```ts
import base from '@siim-m/config/oxlint';
import react from '@siim-m/config/oxlint-react';
import { defineConfig } from 'oxlint';

export default defineConfig({ extends: [base, react] });
```

It turns on oxlint's `react` and `jsx-a11y` plugins, which include the React Compiler's checks, and
three rules of its own:

- `anti-slop-react/no-manual-memo` bans `useMemo`, `useCallback` and the compiler's memo directives.
- `anti-slop-react/no-hookless-use-function` reports a `use*` function that calls no hook.
- `anti-slop-react/require-sync-comment-for-effect` asks for a `// SYNC: <what and why>` comment
  above each effect, naming what outside React it keeps in step.

In `.tsx` files a number can't be a condition, because `{count && <p />}` renders `0`. Write
`count > 0`.

## Oxlint's `suspicious` category

The preset doesn't turn this category on. A project that does will see these rules misfire on
deliberate code:

- `unicorn/consistent-function-scoping` reports helpers inside a Playwright `page.evaluate`
  callback. The browser runs the callback from its source, so a hoisted helper isn't there. Suppress
  these inline with a reason.
- `unicorn/no-array-sort` and `unicorn/no-array-reverse` can't tell an array that `map`, `filter` or
  `Object.keys` just made from one the code doesn't own, and ask for `toSorted` and `toReversed`,
  which need ES2023. `allowAfterSpread` only accepts `[...xs].sort()`, so code that sorts the result
  of `map` has to turn both off.
- `eslint/no-useless-constructor` reports `constructor() { super(); }`, which narrows a subclass's
  constructor, such as a `Map` subclass that takes no entries.

## License

MIT. The anti-slop rules are MIT, copyright Dillon Mulroy; `require-readable-spacing` uses MIT code
from ESLint Stylistic. The `anti-slop-react` rules are MIT, copyright T3 Tools Inc.: rewritten from
T3 Code's `oxlint-plugin-t3code` at `2de3370`, and not kept in step with it. `anti-slop/comments`
and `anti-slop/require-suppression-reason` adapt code from the same plugin. Three `anti-slop-effect`
rules and `no-disabled-type-assertion-rules` are MIT, from Kyle Mistele's fork of anti-slop;
`throw-in-effect-gen` there is ported from enfect, MIT, copyright Marc Suesser, and
`no-unbounded-retry` from cevr/effect-oxlint, MIT. eslint-plugin-ai-guard and @interfere/landmines
are MIT dependencies.
