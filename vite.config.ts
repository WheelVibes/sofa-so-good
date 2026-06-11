import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only proxies for CC0 asset providers that don't ship CORS headers.
// Production deployments need an equivalent proxy (Cloudflare Worker etc.) —
// see TODO.md "Runtime CC0 Catalog: production proxy".
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project site under /sofa-so-good/. Only apply the
  // sub-path for production builds; the dev server stays at root.
  base: command === 'build' ? '/sofa-so-good/' : '/',
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
          if (!id.includes('node_modules')) return undefined
          // Dependencies only reachable through a dynamic import() stay
          // unchunked so Rollup keeps them in their async chunk instead of the
          // always-loaded vendor/three bundles: the post-processing stack
          // (high tier only, lazy via Effects.tsx), the GLB optimize + LOD
          // pass (@gltf-transform/draco/meshoptimizer, bulk-import only),
          // TIFF decode (utif, texture upload only).
          if (
            /[\\/]node_modules[\\/](postprocessing|n8ao|@react-three[\\/]postprocessing|@gltf-transform|draco3dgltf|meshoptimizer|utif)[\\/]/.test(
              id,
            )
          )
            return undefined
          // three/examples/jsm holds the rare-format loaders/exporters (FBX,
          // Collada, USDZ, EXR, GLTFExporter…) that are only dynamic-imported
          // from upload/convert paths — keep them out of the eager three chunk.
          if (/[\\/]node_modules[\\/]three[\\/]examples[\\/]/.test(id)) return undefined
          // Only the three core + its stdlib get their own chunk; everything
          // else (drei, fiber, zustand…) shares vendor. A precise match
          // avoids the import cycles a greedy 'three' test creates with
          // @react-three/* paths.
          if (/[\\/]node_modules[\\/](three|three-stdlib)[\\/]/.test(id)) return 'three'
          // React core in its own long-lived chunk: it changes on a different
          // cadence from the rest of vendor and parses in parallel.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          return 'vendor'
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
      // Local IKEA scraper sidecar (`npm run scraper-server`). Same-origin
      // path so the browser avoids CORS; only resolves while it's running.
      '/ikea': {
        target: 'http://localhost:5174',
        changeOrigin: true,
      },
    },
  },
}))
