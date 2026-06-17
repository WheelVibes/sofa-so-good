import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Dev-only proxies for CC0 asset providers that don't ship CORS headers.
// Production deployments need an equivalent proxy (Cloudflare Worker etc.) —
// see TODO.md "Runtime CC0 Catalog: production proxy".

// The service worker precaches the build so the core app runs fully offline after
// the first load. It is a build/runtime concern (no UI surface), so it isn't a
// FEATURE_FLAGS entry — set VITE_DISABLE_PWA=1 to opt out of generating/registering it.
const pwaEnabled = process.env.VITE_DISABLE_PWA !== '1'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project site under /sofa-so-good/. Only apply the
  // sub-path for production builds; the dev server stays at root.
  base: command === 'build' ? '/sofa-so-good/' : '/',
  plugins: [
    react(),
    ...(pwaEnabled
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            // Keep the existing public/manifest.webmanifest (linked from index.html)
            // as the single source of truth — only generate the service worker.
            manifest: false,
            // A live SW fights Vite HMR and the dev proxies, so keep it build-only;
            // verify offline behaviour against `npm run preview`.
            devOptions: { enabled: false },
            workbox: {
              // Precache the build: the heavy three/vendor/react JS chunks, CSS,
              // the self-hosted fonts (woff2) + draco/basis decoders (wasm), and the
              // bundled GLB/texture assets — everything the core app needs offline.
              globPatterns: [
                '**/*.{js,css,html,svg,wasm,woff2,json,webmanifest}',
                'assets/**/*.{glb,jpg,jpeg,png,ktx2}',
              ],
              // The `three` and `vendor` chunks exceed Workbox's 2 MiB default cap;
              // raise it so they precache and the app boots with no network.
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              cleanupOutdatedCaches: true,
              // The SPA navigation fallback (serve index.html for navigations)
              // must NOT swallow the separately-built VitePress user guide at
              // `<base>/docs/` — without this denylist the SW returns the app
              // shell for the guide (wrong content, online and offline). Denied
              // navigations fall through to the `/docs/` runtime cache below.
              navigateFallbackDenylist: [/\/docs\//],
              runtimeCaching: [
                {
                  // User guide (separate VitePress build at `<base>/docs/`) — not
                  // in the app precache, so cache it on first visit to make the
                  // in-browser guide available offline thereafter.
                  urlPattern: /\/docs\//,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'user-guide',
                    cacheableResponse: { statuses: [0, 200] },
                    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
                {
                  // Remote CC0 catalog assets (Poly Haven / ambientCG / Kenney) are
                  // optional and cross-origin; cache what's been fetched so repeat
                  // browsing works offline. statuses:[0,200] allows opaque responses.
                  urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|webp|glb|hdr|exr|ktx2)$/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'remote-cc0-assets',
                    cacheableResponse: { statuses: [0, 200] },
                    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  },
                },
              ],
            },
          }),
        ]
      : []),
  ],
  // Force a single three.js instance — stats-gl (via drei) otherwise pulls a
  // second, older three, bloating the bundle and breaking instanceof checks.
  // Also dedupe react/react-dom to avoid "Invalid hook call" from duplicate React
  // instances that can arise with a nested node_modules tree.
  resolve: { dedupe: ['three', 'react', 'react-dom', 'react/jsx-runtime', 'scheduler'] },
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
