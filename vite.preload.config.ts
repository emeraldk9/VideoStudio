import { defineConfig } from 'vite';

import { aliases } from './build/aliases.cjs';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: aliases,
  },
});
