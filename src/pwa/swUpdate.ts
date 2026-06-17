import { registerSW } from 'virtual:pwa-register'
import { useStore } from '../state/store'

/**
 * Service-worker registration + update strategy.
 *
 * The SW is built with `registerType: 'autoUpdate'`, so a new build installs and
 * reloads the page on its own — but only once the browser *detects* a new worker,
 * which on iOS standalone (Home-Screen) PWAs happens only on a real launch, and
 * there's no browser reload UI to force it. So we:
 *
 *  1. register the SW ourselves (the plugin's auto-injection is off), then
 *  2. poll for a new worker hourly **and** whenever the app returns to the
 *     foreground (visibility/focus) — covering the installed-PWA case, and
 *  3. expose a manual "Check for updates" (`runUpdateCheck`) with toast feedback,
 *     since Home-Screen users have no address bar / pull-to-refresh.
 *
 * When the SW is disabled (`VITE_DISABLE_PWA=1`, or dev), `registerSW` is a no-op
 * and the manual check reports gracefully.
 */

let swReg: ServiceWorkerRegistration | undefined
let lastForegroundCheck = 0

const HOUR_MS = 60 * 60 * 1000
const FOREGROUND_THROTTLE_MS = 60 * 1000

/** Register the service worker and wire the periodic + foreground update checks. */
export function registerAppServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, r) {
      if (!r) return
      swReg = r
      const check = () => {
        void r.update().catch(() => {})
      }
      // Periodic check while a tab/PWA stays open.
      setInterval(check, HOUR_MS)
      // Re-check on foreground — the key path for installed iOS PWAs, which only
      // look for a new worker on a real launch. Throttled so rapid focus churn
      // doesn't hammer the network.
      const onForeground = () => {
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastForegroundCheck < FOREGROUND_THROTTLE_MS) return
        lastForegroundCheck = now
        check()
      }
      document.addEventListener('visibilitychange', onForeground)
      window.addEventListener('focus', onForeground)
    },
  })
}

export type UpdateCheckResult = 'updating' | 'uptodate' | 'unsupported'

/**
 * Force an update check now. With `autoUpdate`, a found update installs and
 * reloads the page automatically — so a freshly-found worker shows up as
 * `installing`/`waiting` here and we report `'updating'` (the reload follows).
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const reg = swReg ?? (await navigator.serviceWorker.getRegistration())
  if (!reg) return 'unsupported'
  try {
    await reg.update()
  } catch {
    return 'unsupported'
  }
  return reg.installing || reg.waiting ? 'updating' : 'uptodate'
}

/**
 * Manual "Check for updates" with toast feedback — for Home-Screen PWAs that
 * lack a browser reload button. Safe to call from any UI surface.
 */
export async function runUpdateCheck(): Promise<void> {
  const { notify } = useStore.getState()
  const checking = notify.start({ title: 'Checking for updates…', kind: 'progress' })
  const res = await checkForUpdates()
  notify.dismiss(checking)
  if (res === 'updating') {
    notify.start({ title: 'Update found — reloading to the new version…', kind: 'success' })
  } else if (res === 'uptodate') {
    notify.start({ title: 'You’re on the latest version', kind: 'info' })
  } else {
    notify.start({ title: 'Updates aren’t available in this environment', kind: 'info' })
  }
}
