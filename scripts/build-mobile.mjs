// Build the web app for the Capacitor Android shell and sync it into the native
// project, ready for `./gradlew assembleDebug` (locally or in the
// android-apk GitHub Actions workflow). See docs/packaging-android.md.
//
// Mirrors scripts/build-desktop.mjs (Electron) — a wrapped WebView wants the
// same bundle shape:
//  - VITE_BASE=./       relative asset URLs, so the bundle loads from Capacitor's
//                       https://localhost scheme with no absolute-path assumptions
//  - VITE_DISABLE_PWA=1 no service worker — the native shell bundles every asset
//                       already; a SW inside a wrapper only causes stale-cache pain
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, env) =>
  execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })

// 1. Build the self-contained web bundle into dist/.
run('npm run build', { VITE_BASE: './', VITE_DISABLE_PWA: '1' })
// 2. Refresh the Android launcher icons from public/favicon.svg.
run('node scripts/make-android-icons.mjs')
// 3. Copy dist/ into android/app/src/main/assets/public and update native deps.
run('npx cap sync android')
