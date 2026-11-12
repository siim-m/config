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
from ESLint Stylistic. The `anti-slop-react` rules are MIT, copyright T3 Tools Inc.
