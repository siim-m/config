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

## License

MIT. The anti-slop rules are MIT, copyright Dillon Mulroy; `require-readable-spacing` uses MIT code
from ESLint Stylistic.
