import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxies for CC0 asset providers that don't ship CORS headers.
// Production deployments need an equivalent proxy (Cloudflare Worker etc.) —
// see TODO.md "Runtime CC0 Catalog: production proxy".
export default defineConfig({
  plugins: [react()],
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
