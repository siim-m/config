/**
 * eslint-plugin-ai-guard, re-exported so the preset can load it by this package's name. The preset
 * turns on five of its rules; the rest repeat anti-slop, oxlint or the type checker, or, like
 * `no-assertionless-test`, can't see an assertion helper imported from another file.
 */
export { default } from 'eslint-plugin-ai-guard';
