// Build the fully-offline production bundle: the app AND the VitePress user
// guide, with the guide precached by the service worker so it works offline
// from the first launch (not just after one online visit).
//
// Ordering matters. vite-plugin-pwa generates the service worker during the
// app's `vite build`, by globbing the output directory. So the guide must
// already sit in dist/docs at that point. We therefore:
//   1. build the guide first (VitePress → dist/docs, base '/sofa-so-good/docs/')
//   2. run the app build with VITE_KEEP_DIST=1 so it does NOT empty dist/ and
//      the PWA scan picks up dist/docs (see globPatterns + emptyOutDir in
//      vite.config.ts).
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, env) =>
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })

// Start from a clean dist so the precache can't pick up stale chunks from a
// previous build (the app build below runs with emptyOutDir off).
rmSync(join(root, 'dist'), { recursive: true, force: true })

// 1) User guide → dist/docs.
run('npm run docs:build')

// 2) App + service worker, keeping dist/docs so the SW precaches the guide.
run('npm run build', { VITE_KEEP_DIST: '1' })

console.log('\n[build-with-guide] app + user guide built; guide is precached for offline use.')
