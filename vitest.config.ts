import { defineConfig } from 'vitest/config';
import { aliases } from './build/aliases.cjs';

export default defineConfig({
  resolve: {
    alias: aliases,
  },
  test: {
    environment: 'node',
  },
});
