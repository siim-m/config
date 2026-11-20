import * as path from 'node:path';

export const joined = path.join('a', 'b');

export function describe(input: unknown): string {
  const text = String(input);
  return text;
}

export const label = (kind: string): string => (kind === 'a' ? 'A' : kind === 'b' ? 'B' : 'Other');

export function start(): void {
  Promise.resolve(1);
}

export function each(values: number[]): void {
  values.forEach(async (value) => {
    await Promise.resolve(value);
  });
}

// TODO: remove before release.
export function pause(): void {
  debugger;
}

export function fail(): never {
  throw 'failed';
}

// oxlint-disable-next-line anti-slop/no-chained-type-assertions
export const count = 1;

// Turned off in this fixture's oxlint.config.mts.
export const value = Reflect.get({ a: 1 }, 'a');
