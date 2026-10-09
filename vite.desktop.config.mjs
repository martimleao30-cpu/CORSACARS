import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Web version on GitHub Pages stays unchanged. The Windows executable bundles
// local Three.js/cannon-es source modules rather than opening a remote site.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    target: 'chrome120',
    rollupOptions: { input: resolve('desktop/index.html') }
  }
});
