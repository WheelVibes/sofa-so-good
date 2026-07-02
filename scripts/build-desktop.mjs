// Build the web app for the Electron desktop shell (cross-platform env setup —
// npm scripts can't set env vars portably on Windows):
//  - VITE_BASE=./       relative asset URLs, so the bundle loads from the
//                       packaged app:// scheme (see electron/main.mjs)
//  - VITE_DISABLE_PWA=1 no service worker — the desktop shell owns its update
//                       story; a SW inside a wrapper only causes stale-cache pain
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
execSync('npm run build', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: './', VITE_DISABLE_PWA: '1' },
})
// App icon for electron-builder (build/icon.png, generated — not committed).
execSync('node scripts/make-desktop-icon.mjs', { cwd: root, stdio: 'inherit' })
