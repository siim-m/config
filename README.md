# @siim-m/config

Shared oxlint, oxfmt and tsconfig settings for TypeScript, with the
[anti-slop](https://github.com/dmmulroy/anti-slop) oxlint rules.

```sh
bun add -d @siim-m/config oxlint oxlint-tsgolint oxfmt
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

Every rule is on at `error`; a project turns off what it can't pass yet. Run oxlint with
`--type-aware`. For ts-reset's stricter built-in types, add `import '@siim-m/config/reset.d.ts';` to
a `.d.ts` file in the project.

## Comments

`anti-slop/comments` holds a comment to a short why. By default a comment gets 30 words, a doc
comment on an export 45, and it may cite one issue. It also reports section dividers, test step
labels, commented-out code, TODOs without a link, JSDoc types in TypeScript, and comments that only
repeat the name below them. `forbidden` adds patterns of your own:

```ts
'anti-slop/comments': ['error', {
  maxWords: 30,
  forbidden: [{ pattern: '\\b\\d{4}-\\d{2}-\\d{2}\\b', message: 'Leave dates to git.' }],
}],
```

`policy: 'tagged-only'` goes further: only directives, licence headers, doc comments on exports and
comments that start with an `allow` prefix stay. The prefixes default to `SAFETY`, `SYNC` and
`WARNING`, which the type-assertion and React effect rules ask for.

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

## License

MIT. The anti-slop rules are MIT, copyright Dillon Mulroy; `require-readable-spacing` uses MIT code
from ESLint Stylistic. The `anti-slop-react` rules are MIT, copyright T3 Tools Inc.: rewritten from
T3 Code's `oxlint-plugin-t3code` at `2de3370`, and not kept in step with it.
