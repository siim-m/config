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
    // A service whose shape is plain data, such as the current user, holds a value, not operations,
    // so a function may take that data from anyone.
    `class Person extends Schema.Class<Person>('Person')({ id: Schema.String }) {}
    class CurrentPerson extends Context.Service<CurrentPerson, Person>()('CurrentPerson') {}
    const isGuest = (person: Person) => person.id === '';`,
    `interface Person { readonly id: string; readonly name: string }
    class CurrentPerson extends Context.Service<CurrentPerson, Person>()('CurrentPerson') {}
    const greet = (person: Person) => person.name;`,
    // An imported shape is a service only by the \`…Shape\` naming.
    `import type { Person } from './person';
    class CurrentPerson extends Context.Service<CurrentPerson, Person>()('CurrentPerson') {}
    const isGuest = (person: Person) => person.id === '';`,
    // A data-only service's instance is that data too.
    `class Person extends Schema.Class<Person>('Person')({ id: Schema.String }) {}
    class CurrentPerson extends Context.Service<CurrentPerson, Person>()('CurrentPerson') {}
    const audit = (person: CurrentPerson['Service']) => person.id;`,
    `class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()('CurrentUser') {}
    const audit = (user: CurrentUser['Service']) => user.id;`,
    // A schema's `Type` is data, as in a union of two Schema.Struct types.
    `const User = Schema.Struct({ id: Schema.String, email: Schema.String });
    type User = typeof User.Type;
    const Guest = Schema.Struct({ id: Schema.String, email: Schema.Null });
    type Guest = Schema.Schema.Type<typeof Guest>;
    type Person = User | Guest;
    class CurrentPerson extends Context.Service<CurrentPerson, Person>()('CurrentPerson') {}
    const isGuest = (person: Person) => person.email === null;
    const audit = (person: CurrentPerson['Service']) => person.id;`,
    // A generic shape names no type of its own.
    `class Settings extends Context.Service<Settings, Record<string, string>>()('Settings') {}
    const tally = (counts: Record<string, number>) => counts;`,
    // Only an Effect service factory names a service's shape.
    `interface Props { onSave(): void }
    class Form extends component<Form, Props>() {}
    const render = (props: Props) => props.onSave();`,
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
      // The shape may be declared after the class, and an Effect-valued member is an operation.
      code: `export class Clock extends Context.Service<Clock, ClockShape>()('app/Clock') {}
      type ClockShape = { readonly now: Effect.Effect<Date> };
      const stamp = (clock: ClockShape) => clock.now;`,
      errors: [{ ...error, data: { parameter: 'clock', service: 'Clock' } }],
    },
    {
      code: `interface StoreShape { find(id: string): Effect.Effect<Row> }
      interface CachedStoreShape extends StoreShape { readonly size: number }
      export class Store extends Context.Service<Store, CachedStoreShape>()('app/Store') {}
      const load = (store: CachedStoreShape, id: string) => store.find(id);`,
      errors: [{ ...error, data: { parameter: 'store', service: 'Store' } }],
    },
    {
      // A shape whose members the rule can't see stays a service.
      code: `const make = Effect.gen(function* () { return { send: (to: string) => Effect.void } });
      type MailerShape = Effect.Success<typeof make>;
      export class Mailer extends Context.Service<Mailer, MailerShape>()('app/Mailer') {}
      const notify = (mailer: MailerShape) => mailer.send('a');`,
      errors: [{ ...error, data: { parameter: 'mailer', service: 'Mailer' } }],
    },
    {
      // Operations behind a local alias or in a nested object.
      code: `type Send = (to: string) => Effect.Effect<void>;
      interface SmsShape { readonly send: Send }
      interface RepoShape { readonly users: { readonly find: (id: string) => Effect.Effect<User> } }
      export class Sms extends Context.Service<Sms, SmsShape>()('app/Sms') {}
      export class Repo extends Context.Service<Repo, RepoShape>()('app/Repo') {}
      const text = (sms: SmsShape, repo: RepoShape) => sms.send('a');`,
      errors: [
        { ...error, data: { parameter: 'sms', service: 'Sms' } },
        { ...error, data: { parameter: 'repo', service: 'Repo' } },
      ],
    },
    {
      // Effect 3's Context.Tag, and a default-exported service.
      code: `interface CacheOps { get(key: string): Effect.Effect<string> }
      interface MailOps { send(): Effect.Effect<void> }
      class Cache extends Context.Tag('app/Cache')<Cache, CacheOps>() {}
      export default class Mailer extends Context.Service<Mailer, MailOps>()('app/Mailer') {}
      const read = (cache: CacheOps, mail: MailOps) => cache.get('a');`,
      errors: [
        { ...error, data: { parameter: 'cache', service: 'Cache' } },
        { ...error, data: { parameter: 'mail', service: 'Mailer' } },
      ],
    },
    {
      // An imported shape is a service's instance; only the bare imported name may be data.
      code: `import type { MailerApi } from './api';
      class Mailer extends Context.Service<Mailer, MailerApi>()('app/Mailer') {}
      const a = (mailer: Mailer['Service']) => mailer;
      const b = (mailer: Context.Service.Shape<typeof Mailer>) => mailer;`,
      errors: [
        { ...error, data: { parameter: 'mailer', service: 'Mailer' } },
        { ...error, data: { parameter: 'mailer', service: 'Mailer' } },
      ],
    },
    {
      // Operations behind an index signature, a state handle, or a data class's method.
      code: `interface HooksShape { readonly [name: string]: () => Effect.Effect<void> }
      interface CounterShape { readonly count: Ref.Ref<number> }
      class Account extends Schema.Class<Account>('Account')({ id: Schema.String }) {
        send() { return Effect.log(this.id); }
      }
      class Hooks extends Context.Service<Hooks, HooksShape>()('app/Hooks') {}
      class Counter extends Context.Service<Counter, CounterShape>()('app/Counter') {}
      class CurrentAccount extends Context.Service<CurrentAccount, Account>()('app/CurrentAccount') {}
      const run = (hooks: HooksShape, counter: CounterShape, account: Account) => account.send();`,
      errors: [
        { ...error, data: { parameter: 'hooks', service: 'Hooks' } },
        { ...error, data: { parameter: 'counter', service: 'Counter' } },
        { ...error, data: { parameter: 'account', service: 'CurrentAccount' } },
      ],
    },
    {
      // An exempt service doesn't hide another one beside it.
      code: `import type { AllowedShape, MailerShape } from './services';
      const notify = (both: AllowedShape & MailerShape) => both.send();`,
      options: [{ exempt: ['Allowed'] }],
      errors: [{ ...error, data: { parameter: 'both', service: 'Mailer' } }],
    },
    {
      // Part of a service is still the service.
      code: `import type { MailerShape } from './mailer';
      const notify = (mailer: Pick<MailerShape, 'send'>, audit: MailerShape & Audited) => mailer.send();`,
      errors: [
        { ...error, data: { parameter: 'mailer', service: 'Mailer' } },
        { ...error, data: { parameter: 'audit', service: 'Mailer' } },
      ],
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
