import { Effect } from 'effect';

export const config = Effect.succeed('a').pipe(Effect.orDie);
