import base from '@siim-m/config/oxlint';
import { defineConfig } from 'oxlint';

// A consumer's config: the preset, plus one rule turned off.
export default defineConfig({
  extends: [base],
  rules: { 'anti-slop/no-reflect-get': 'off' },
});
