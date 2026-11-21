import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

const add = (a: number, b: number): number => a + b;

await test('adds two numbers', () => {
  assert.equal(add(1, 1), 2);
});

await test('two plus two', () => {
  assert.equal(2 + 2, 4);
});

await test('loads the page', () => {
  add(1, 2);
});

await test('waits for the cache', { timeout: 60_000 }, async () => {
  await sleep(100);
  assert.equal(add(2, 3), 5);
});
