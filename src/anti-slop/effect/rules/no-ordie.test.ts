import { RuleTester } from 'oxlint/plugins-dev';
import { noOrDieRule } from './no-ordie.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const imports = `
  import * as Effect from 'effect/Effect';
  import * as Layer from 'effect/Layer';
  import * as Stream from 'effect/Stream';
`;
const orDie = (module: string, member: string) => ({
  messageId: 'orDie',
  data: { module, member },
});
const catchDie = (module: string) => ({ messageId: 'catchDie', data: { module } });

tester.run('anti-slop-effect/no-ordie', noOrDieRule, {
  valid: [
    // Dying on named errors: a new error stays in the error type.
    `${imports}
    const config = loadConfig.pipe(Effect.catchTag('ConfigMissing', Effect.die));`,
    `${imports}
    const config = loadConfig.pipe(
      Effect.catchTags({ ConfigMissing: Effect.die, ConfigInvalid: (error) => Effect.die(error) })
    );`,
    `${imports}
    const user = decode(input).pipe(Effect.catchTag('SchemaError', (error) => Effect.die(error)));`,
    // A catch that dies on some errors and handles or re-fails the rest.
    `${imports}
    const row = find(id).pipe(
      Effect.catch((error) => (error._tag === 'Corrupt' ? Effect.die(error) : Effect.fail(error)))
    );`,
    `${imports}
    const rows = list.pipe(Effect.catch(() => Effect.succeed([])));`,
    `${imports}
    const changes = feed.pipe(Stream.catchTag('Disconnected', Stream.die));`,
    // Not Effect's modules.
    `import * as Effect from 'other-library';
    const value = risky.pipe(Effect.orDie, Effect.catch(Effect.die));`,
  ],
  invalid: [
    {
      code: `${imports}
      const program = Effect.gen(function* () {
        yield* risky.pipe(Effect.orDie);
      });`,
      errors: [orDie('Effect', 'orDie')],
    },
    {
      code: `import { Effect } from 'effect';
      const value = Effect.orDie(risky);
      const other = Effect.orDieWith(risky, (error) => new Error(String(error)));`,
      errors: [orDie('Effect', 'orDie'), orDie('Effect', 'orDieWith')],
    },
    {
      code: `${imports}
      const changes = feed.pipe(Stream.orDie);`,
      errors: [orDie('Stream', 'orDie')],
    },
    {
      code: `${imports}
      const logLayer = layerJsonl(path).pipe(Layer.orDie);`,
      errors: [{ messageId: 'layerOrDie' }],
    },
    // A catch whose handler always dies is orDie by hand, in Effect 4's and Effect 3's names.
    {
      code: `${imports}
      const a = risky.pipe(Effect.catch(Effect.die));
      const b = Effect.catch(risky, (error) => Effect.die(error));
      const c = risky.pipe(Effect.catchAll((error) => {
        return Effect.dieMessage(String(error));
      }));`,
      errors: [catchDie('Effect'), catchDie('Effect'), catchDie('Effect')],
    },
    {
      code: `${imports}
      const changes = feed.pipe(Stream.catch(Stream.die));`,
      errors: [catchDie('Stream')],
    },
    // A handler declared apart from the catch.
    {
      code: `${imports}
      const handler = (error: Error) => Effect.die(error);
      function escalate(error: Error) { return Effect.die(error); }
      const a = risky.pipe(Effect.catch(handler));
      const b = risky.pipe(Effect.catch(escalate));`,
      errors: [catchDie('Effect'), catchDie('Effect')],
    },
  ],
});
