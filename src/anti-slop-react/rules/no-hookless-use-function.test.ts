import { RuleTester } from 'oxlint/plugins-dev';
import { noHooklessUseFunctionRule } from './no-hookless-use-function.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });

tester.run('anti-slop-react/no-hookless-use-function', noHooklessUseFunctionRule, {
  valid: [
    'function useCount() { const [count] = useState(0); return count; }',
    // React 19's bare `use` is a hook call too.
    'const useTheme = () => use(ThemeContext);',
    'const useStore = () => React.useContext(StoreContext);',
    'function user() { return null; }',
  ],
  invalid: [
    {
      code: 'function useFontFamily(weight) { return FONT_FAMILIES[weight]; }',
      errors: [{ messageId: 'noHook', data: { name: 'useFontFamily' } }],
    },
    {
      code: 'const useUpdateSettings = () => (patch) => persist(patch);',
      errors: [{ messageId: 'noHook', data: { name: 'useUpdateSettings' } }],
    },
    {
      code: 'const useLabel = function () { return label; };',
      errors: [{ messageId: 'noHook', data: { name: 'useLabel' } }],
    },
    // A hook called inside a callback runs when the callback does, not during render.
    {
      code: 'function useHandler() { return () => useState(0); }',
      errors: [{ messageId: 'noHook', data: { name: 'useHandler' } }],
    },
  ],
});
