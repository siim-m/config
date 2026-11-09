import { RuleTester } from 'oxlint/plugins-dev';
import { noServiceParametersRule } from './no-service-parameters.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const error = { messageId: 'serviceParameter' };
const baselined = {
  cwd: '/repo',
  filename: '/repo/src/loans/remind.ts',
};

tester.run('anti-slop-effect/no-service-parameters', noServiceParametersRule, {
  valid: [
    // The helper acquires the service from context instead of taking it.
    `const overdueLoans = Effect.fnUntraced(function* (memberId: MemberId, now: DateTime.Utc) {
      const loans = yield* LoanStore;
      return yield* loans.findOverdue(memberId, now);
    });`,
    // A service listed in `exempt`, such as request-scoped context, may be handed along.
    {
      code: 'function audit(session: Session["Service"]) {}',
      options: [{ exempt: ['Session'] }],
    },
    // A type derived from a service member is not the service.
    `import type { LedgerShape } from '@lib/ledger';
    function record(entry: Parameters<Parameters<LedgerShape['batch']>[0]>[0]) {}`,
    // A callback that receives the service is how context hands it over.
    `const withCatalog = <A, E, R>(
      fn: (catalog: Effect.Success<typeof Catalog.make>) => Effect.Effect<A, E, R>
    ) => Effect.flatMap(Catalog, fn);`,
    // A local type is only a service shape when a service class names it.
    'type EntryShape = { readonly id: string }; function render(entry: EntryShape) {}',
    {
      ...baselined,
      code: `type NotifierShape = Context.Service.Shape<typeof Notifier>;
      const remind = (notifier: NotifierShape, loan: Loan) =>
        notifier.send(loan);`,
      options: [{ baseline: ['src/loans/remind.ts#remind.notifier'] }],
    },
  ],
  invalid: [
    {
      code: `const overdueLoans = (loans: LoanStore['Service'], memberId: MemberId, now: DateTime.Utc) =>
        loans.findOverdue(memberId, now);`,
      errors: [{ ...error, data: { parameter: 'loans', service: 'LoanStore' } }],
    },
    {
      // Only the services listed in `exempt` may be handed along.
      code: 'function audit(session: Session["Service"]) {}',
      errors: [{ ...error, data: { parameter: 'session', service: 'Session' } }],
    },
    {
      code: `import type { CacheShape } from '../cache';
      export const remember = Effect.fnUntraced(function* (key: string, value: string, cache: CacheShape) {
        return yield* cache.set(key, value);
      });`,
      errors: [{ ...error, data: { parameter: 'cache', service: 'Cache' } }],
    },
    {
      code: `import type { LedgerShape } from '@lib/ledger';
      export const settle = Effect.fnUntraced(function* (loanId: LoanId, append: LedgerShape['append']) {});`,
      errors: [{ ...error, data: { parameter: 'append', service: 'Ledger' } }],
    },
    {
      code: 'export function seedBooks(store: Effect.Success<typeof BookStore>, count: number) {}',
      errors: [{ ...error, data: { parameter: 'store', service: 'BookStore' } }],
    },
    {
      code: `export const renewLoan = (
        call: Effect.Success<typeof LibraryApi.make>['call'],
        loanId: LoanId
      ) => call('loans.renew', loanId);`,
      errors: [{ ...error, data: { parameter: 'call', service: 'LibraryApi' } }],
    },
    {
      code: `interface MailerShape { readonly send: (to: string, body: string) => Effect.Effect<void> }
      export class Mailer extends Context.Service<Mailer, MailerShape>()('app/Mailer') {}
      const notify = (mailer: MailerShape, to: string) => mailer.send(to, 'Due soon');`,
      errors: [{ ...error, data: { parameter: 'mailer', service: 'Mailer' } }],
    },
    {
      ...baselined,
      code: `type NotifierShape = Context.Service.Shape<typeof Notifier>;
      const remindAll = (notifier: NotifierShape) => notifier.sendAll(loans);`,
      options: [{ baseline: ['src/loans/remind.ts#remind.notifier'] }],
      errors: [
        { messageId: 'staleBaseline', data: { entry: 'src/loans/remind.ts#remind.notifier' } },
        { ...error, data: { parameter: 'notifier', service: 'Notifier' } },
      ],
    },
  ],
});
