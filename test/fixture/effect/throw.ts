import { Effect } from 'effect';

// The same program as throw.test.ts, which the preset's test override lets throw.
export const program = Effect.gen(function* () {
  yield* Effect.void;
  throw new Error('boom');
});
