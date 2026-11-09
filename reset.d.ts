// Stricter built-in types from @total-typescript/ts-reset's recommended set. `JSON.parse`,
// `fetch`'s `.json()`, `Array.isArray` and a promise's `.catch` give `unknown` instead of `any`;
// `.filter(Boolean)` narrows; `includes`, `indexOf` and `has` accept wider values.
import '@total-typescript/ts-reset';
