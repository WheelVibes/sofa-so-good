import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pin tests to Singapore time so wall-clock-dependent assertions
// (e.g. useSunPosition with manualHour=0 expecting night) are deterministic.
process.env.TZ = 'Asia/Singapore'

export default defineConfig({
  plugins: [react()],
  // Prevent duplicate React/three when a nested node_modules/ sub-tree is present.
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'scheduler', 'three'],
    // vite-plugin-pwa's `virtual:pwa-register` only exists during a real Vite
    // build/dev; stub it so component tests that import the SW-update helper run.
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/pwa/pwaRegisterStub.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Most test files are pure logic (no DOM) — default to the cheap 'node'
    // environment and opt individual files into 'happy-dom' via a
    // `// @vitest-environment happy-dom` pragma at the top of the file.
    // This avoids paying happy-dom's per-file setup cost (~1.5s * ~400 files)
    // for tests that never touch window/document/render().
    environment: 'node',
    // 'threads' beats the default 'forks' here (~128s vs ~156s full run).
    // Do NOT set `isolate: false`: it cuts the run to ~87s but leaks store/
    // module state across files (93 failures when tried — many files rely on
    // a fresh module graph around `__resetForTest`/`vi.doMock`).
    pool: 'threads',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    // Never pick up test files under .claude/ or other vendored dirs.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'],
    env: {
      TZ: 'Asia/Singapore',
      // Tests run offline-deterministic: no backend, regardless of the developer's
      // .env (which sets VITE_API_BASE=/api for the Cloudflare build). Backend-path
      // tests mock `hasBackend` themselves (see sharedLibrarySlice.test.ts).
      VITE_API_BASE: '',
    },
  },
})
