import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only proxies for CC0 asset providers that don't ship CORS headers.
// Production deployments need an equivalent proxy (Cloudflare Worker etc.) —
// see TODO.md "Runtime CC0 Catalog: production proxy".
export default defineConfig({
  plugins: [react()],
  // Force a single three.js instance — stats-gl (via drei) otherwise pulls a
  // second, older three, bloating the bundle and breaking instanceof checks.
  resolve: { dedupe: ['three'] },
  build: {
    // Split heavy, rarely-changing dependencies into their own long-lived
    // cache chunks so app-code edits don't bust the whole bundle and the
    // browser can parse vendor code in parallel.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // The post-processing stack (only used on the high tier) is loaded
          // lazily via Effects.tsx — leave it unchunked so Rollup keeps it in
          // that async chunk instead of the always-loaded vendor bundle.
          if (/[\\/]node_modules[\\/](postprocessing|n8ao|@react-three[\\/]postprocessing)[\\/]/.test(id))
            return undefined;
          // Only the three core + its stdlib get their own chunk; everything
          // else (react, drei, fiber, zustand…) shares vendor. A precise match
          // avoids the import cycles a greedy 'three' test creates with
          // @react-three/* paths.
          if (/[\\/]node_modules[\\/](three|three-stdlib)[\\/]/.test(id)) return 'three';
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
