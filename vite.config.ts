import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // Only the tree test is published. The click test from ld-nav-lab is kept
      // in the repo but left out of the build, so it can't write to that study.
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
