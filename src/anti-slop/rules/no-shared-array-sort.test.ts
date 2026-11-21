import { RuleTester } from 'oxlint/plugins-dev';
import { noSharedArraySortRule } from './no-shared-array-sort.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const shared = (method: string) => ({ messageId: 'shared', data: { method } });

tester.run('anti-slop/no-shared-array-sort', noSharedArraySortRule, {
  valid: [
    // An array the expression just made belongs to nobody else.
    'const names = (users: User[]) => users.map((user) => user.name).sort();',
    'const keys = (config: Config) => Object.keys(config).sort();',
    'const open = (rows: Row[]) => rows.filter(isOpen).sort(byDate).reverse();',
    'const rest = (xs: number[]) => xs.slice(1).reverse();',
    'const copy = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);',
    'const all = (set: Set<string>) => Array.from(set).sort();',
    'const words = (text: string) => text.split(" ").sort();',
    'const both = (a: number[], b: number[]) => a.concat(b).sort();',
    // So does a local binding that holds one and isn't reassigned.
    `function latest(rows: Row[]) {
      const out = rows.filter(isOpen);
      out.sort(byDate);
      return out;
    }`,
    `function collect(items: Item[]) {
      const out: string[] = [];
      for (const item of items) out.push(item.id);
      out.sort();
      return out;
    }`,
    // Either branch of a conditional, when both are fresh.
    `function best(rows: Row[]) {
      const fitting = rows.filter(fits);
      const weighed = rows.map(weigh);
      return (fitting.length > 0 ? fitting : weighed).sort(byMiss)[0];
    }`,
    // A module's sort function, such as Effect's Array.sort, returns a new array.
    `import { Array } from 'effect';
    import * as Arr from 'effect/Array';
    import * as Chunk from './chunk';
    const a = (xs: number[]) => Array.sort(xs, order);
    const b = (xs: number[]) => Arr.reverse(xs);
    const c = (xs: Chunk.Chunk<number>) => Chunk.sort(xs, order);`,
    // A type assertion around a fresh array doesn't hide it.
    'const sorted = (xs: number[]) => (xs.slice() as number[]).sort();',
  ],
  invalid: [
    // A parameter, property or import belongs to the caller.
    { code: 'function order(xs: number[]) { xs.sort(); }', errors: [shared('sort')] },
    { code: 'const flip = (xs: number[]) => xs.reverse();', errors: [shared('reverse')] },
    {
      code: 'class Store { items: Item[] = []; ordered() { return this.items.sort(byName); } }',
      errors: [shared('sort')],
    },
    { code: "import { ROWS } from './rows';\nROWS.sort();", errors: [shared('sort')] },
    {
      code: 'const pick = (xs: number[], fallback: number[]) => (xs.length > 0 ? xs : fallback.slice()).sort();',
      errors: [shared('sort')],
    },
    // So does whatever an unknown function returns.
    { code: 'const order = () => loadRows().sort();', errors: [shared('sort')] },
    // A module-level array is shared by every call of the function that sorts it.
    {
      code: 'const ORDER = ["b", "a"];\nexport const first = () => ORDER.sort()[0];',
      errors: [shared('sort')],
    },
    // A local that once held a fresh array but was reassigned may hold anything.
    {
      code: `function order(xs: number[]) {
        let out = xs.slice();
        out = xs;
        out.sort();
      }`,
      errors: [shared('sort')],
    },
    // Reversing a sorted shared array reorders the shared array twice.
    {
      code: 'const order = (xs: number[]) => xs.sort().reverse();',
      errors: [shared('reverse'), shared('sort')],
    },
  ],
});
