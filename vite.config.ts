import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // The tree test and the click test are separate pages with separate bundles.
      input: {
        main: resolve(__dirname, 'index.html'),
        clicktest: resolve(__dirname, 'clicktest.html'),
      },
    },
  },
});
