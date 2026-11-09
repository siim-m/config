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

export function pause(): void {
  debugger;
}

// Turned off in this fixture's oxlint.config.mts.
export const value = Reflect.get({ a: 1 }, 'a');
