import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths let the same bundle run at a GitHub Pages project URL.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' }
});
