import { RuleTester } from 'oxlint/plugins-dev';
import { noManualMemoRule } from './no-manual-memo.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });

tester.run('anti-slop-react/no-manual-memo', noManualMemoRule, {
  valid: [
    'const total = items.length * 2;',
    'const ref = React.useRef(null);',
    'function Panel() { "use client"; return null; }',
    // The directive's text as a plain string is not a directive.
    'const label = "use no memo";',
  ],
  invalid: [
    {
      code: 'const total = useMemo(() => items.length, [items]);',
      errors: [{ messageId: 'memoHook', data: { name: 'useMemo' } }],
    },
    {
      code: 'const onClick = useCallback(() => save(), []);',
      errors: [{ messageId: 'memoHook', data: { name: 'useCallback' } }],
    },
    {
      code: 'const total = React.useMemo(() => items.length, [items]);',
      errors: [{ messageId: 'memoHook', data: { name: 'useMemo' } }],
    },
    {
      code: 'function useTotal(items) { "use memo"; return items.length; }',
      errors: [{ messageId: 'useMemoDirective' }],
    },
    {
      code: 'function Panel() { "use no memo"; return null; }',
      errors: [{ messageId: 'optOutDirective', data: { directive: 'use no memo' } }],
    },
    {
      code: '"use no forget";\nexport const a = 1;',
      errors: [{ messageId: 'optOutDirective', data: { directive: 'use no forget' } }],
    },
  ],
});
