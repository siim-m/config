import { RuleTester } from 'oxlint/plugins-dev';
import { requireSuppressionReasonRule } from './require-suppression-reason.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const lint = { messageId: 'lintDirective' };
const typescript = { messageId: 'typescriptDirective' };

tester.run('anti-slop/require-suppression-reason', requireSuppressionReasonRule, {
  valid: [
    '// oxlint-disable-next-line no-console -- the CLI prints its result\nconsole.log(1);',
    '/* eslint-disable no-console -- a script */\nconsole.log(1);',
    '// The CLI prints its result.\n// oxlint-disable-next-line no-console\nconsole.log(1);',
    '// oxlint-enable no-console\nconsole.log(1);',
    '// @ts-expect-error -- the types lag the API\nconst a: string = 1;',
    '// @ts-expect-error: the types lag the API\nconst a: string = 1;',
    '// The types lag the API.\n// @ts-expect-error\nconst a: string = 1;',
  ],
  invalid: [
    { code: '// oxlint-disable-next-line no-console\nconsole.log(1);', errors: [lint] },
    { code: '/* eslint-disable no-console */\nconsole.log(1);', errors: [lint] },
    { code: '// oxlint-disable-next-line no-console --\nconsole.log(1);', errors: [lint] },
    {
      code: 'const a = 1;\n// oxlint-disable-next-line no-console\nconsole.log(a);',
      errors: [lint],
    },
    { code: '// @ts-expect-error\nconst a: string = 1;', errors: [typescript] },
    { code: '// @ts-ignore\nconst a: string = 1;', errors: [typescript] },
    {
      code: '// prettier-ignore\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [lint],
    },
    {
      code: '#!/usr/bin/env node\n// oxlint-disable-next-line no-console\nconsole.log(1);',
      errors: [lint],
    },
    { code: '// @ts-nocheck\nconst a = 1;', errors: [typescript] },
  ],
});
