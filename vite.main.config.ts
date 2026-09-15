import { defineConfig } from 'vite';

import { aliases } from './build/aliases.cjs';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: aliases,
  },
  build: {
    commonjsOptions: {
      ignore: ['bufferutil', 'utf-8-validate'],
    },
    rollupOptions: {
      external: ['better-sqlite3', 'ffmpeg-static', 'onnxruntime-node'],
    },
  },
});
