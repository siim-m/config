import base from '@siim-m/config/oxlint';
import react from '@siim-m/config/oxlint-react';
import { defineConfig } from 'oxlint';

// A React project's config: the base preset, then the React one.
export default defineConfig({ extends: [base, react] });
