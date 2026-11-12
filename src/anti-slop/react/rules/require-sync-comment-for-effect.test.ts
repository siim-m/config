import { RuleTester } from 'oxlint/plugins-dev';
import { requireSyncCommentForEffectRule } from './require-sync-comment-for-effect.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'tsx' } } });
const error = { messageId: 'missingSyncComment' };

tester.run('anti-slop-react/require-sync-comment-for-effect', requireSyncCommentForEffectRule, {
  valid: [
    `function Title({ title }) {
      // SYNC: the document title follows the open page.
      useEffect(() => { document.title = title; }, [title]);
      return null;
    }`,
    // Other comments may sit between the reason and the effect.
    `function Size() {
      // SYNC: the window's resize events.
      // oxlint-disable-next-line some-plugin/some-rule -- unrelated
      React.useLayoutEffect(() => {});
      return null;
    }`,
    `const useResize = () => {
      // SYNC: the window's resize events.
      return useEffect(() => {}, []);
    };`,
    // Mentions of the hooks that are not calls.
    `// useEffect(() => {}) in a comment
    const label = 'useEffect(() => {})';
    const alias = useEffect;
    const pipeline = Effect.matchCauseEffect(effect, {});`,
  ],
  invalid: [
    { code: 'function Panel() { useEffect(() => {}, []); return null; }', errors: [error] },
    {
      code: `function Panel() {
        // Subscribe to resize events.
        React.useInsertionEffect(() => {});
        return null;
      }`,
      errors: [error],
    },
    {
      code: `function Panel() {
        // SYNC:
        useLayoutEffect(() => {});
        return null;
      }`,
      errors: [error],
    },
  ],
});
