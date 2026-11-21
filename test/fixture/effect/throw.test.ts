import { Effect } from 'effect';

// The same program as throw.ts, which is not a test, so the rule reports it there.
export const program = Effect.gen(function* () {
  yield* Effect.void;
  throw new Error('boom');
});
