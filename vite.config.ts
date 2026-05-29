import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxies for CC0 asset providers that don't ship CORS headers.
// Production deployments need an equivalent proxy (Cloudflare Worker etc.) —
// see TODO.md "Runtime CC0 Catalog: production proxy".
export default defineConfig({
  plugins: [react()],
  build: {
    // Split heavy, rarely-changing dependencies into their own long-lived
    // cache chunks so app-code edits don't bust the whole bundle and the
    // browser can parse vendor code in parallel.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three') || id.includes('three-stdlib')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/acg': {
        target: 'https://ambientcg.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/acg/, ''),
      },
      '/acg-cdn': {
        target: 'https://acg-media.ambientcg.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/acg-cdn/, ''),
      },
      '/kenney': {
        target: 'https://kenney.nl',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/kenney/, ''),
      },
    },
  },
});
