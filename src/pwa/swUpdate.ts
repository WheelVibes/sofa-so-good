import { registerSW } from 'virtual:pwa-register'
import { isDesktopShell, runDesktopUpdateCheck } from '../desktop/updateCheck'
import { useStore } from '../state/store'
import { APP_VERSION } from '../version'

/**
 * Service-worker registration + update strategy.
 *
 * The SW is built with `registerType: 'prompt'`, so a new build INSTALLS but
 * waits — we never reload behind the user's back. Instead we:
 *
 *  1. register the SW ourselves (the plugin's auto-injection is off) and check
 *     for a new worker **on open**, then
 *  2. keep checking hourly **and** whenever the app returns to the foreground
 *     (visibility/focus) — covering installed iOS PWAs, which only look for a
 *     new worker on a real launch, and
 *  3. when a new version is waiting, surface a single "Update available" toast
 *     with an **Update** button; clicking it (`applyUpdate`) tells the worker to
 *     `skipWaiting` and reloads to the new version.
 *
 * The on-open/background checks are SILENT unless they find an update (no toast
 * for "up to date"); the manual "Check for updates" (`runUpdateCheck`, File menu
 * / mobile) gives full feedback — a checking spinner then up-to-date / update /
 * error — for the user who explicitly asked.
 *
 * When the SW is disabled (`VITE_DISABLE_PWA=1`, or dev), `registerSW` is a no-op
 * and the manual check reports gracefully.
 */

let swReg: ServiceWorkerRegistration | undefined
/** The plugin's updater — `updateSW(true)` skips waiting + reloads. */
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined
let lastForegroundCheck = 0

const HOUR_MS = 60 * 60 * 1000
const FOREGROUND_THROTTLE_MS = 60 * 1000

/** Register the service worker and wire the on-open + periodic + foreground
 *  update checks. A found update surfaces the confirm prompt, never an auto-reload. */
export function registerAppServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  updateSW = registerSW({
    immediate: true,
    // A new worker has installed and is waiting — let the user apply it.
    onNeedRefresh() {
      showUpdatePrompt()
    },
    onRegisteredSW(_swUrl, r) {
      if (!r) return
      swReg = r
      // Check on open, then keep fresh.
      void r.update().catch(() => {})
      // Periodic check while a tab/PWA stays open.
      setInterval(() => void r.update().catch(() => {}), HOUR_MS)
      // Re-check on foreground — the key path for installed iOS PWAs, which only
      // look for a new worker on a real launch. Throttled so rapid focus churn
      // doesn't hammer the network.
      const onForeground = () => {
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastForegroundCheck < FOREGROUND_THROTTLE_MS) return
        lastForegroundCheck = now
        void r.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', onForeground)
      window.addEventListener('focus', onForeground)
    },
  })
}

/**
 * Surface the "Update available" toast — info kind, never auto-dismissing, with
 * an **Update** action that applies the waiting worker. The on-open, periodic,
 * foreground and manual checks can all call it freely: the notifications slice
 * de-dupes identical non-progress toasts (same kind+title+message), so a repeat
 * resurfaces the one prompt instead of stacking copies.
 */
export function showUpdatePrompt(): void {
  const { notify } = useStore.getState()
  notify.start({
    title: 'Update available',
    message: 'A new version of Sofa So Good is ready.',
    kind: 'info',
    icon: 'Versions',
    autoDismissMs: null,
    actionLabel: 'Update',
    onAction: () => void applyUpdate(),
  })
}

/** Apply the waiting update: skip waiting + reload to the new version. */
export async function applyUpdate(): Promise<void> {
  if (updateSW) {
    await updateSW(true)
  } else if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

export type UpdateCheckResult = 'updating' | 'uptodate' | 'unsupported'

/**
 * Force an update check now. A freshly-found worker shows up as
 * `installing`/`waiting` here; under `prompt` mode it waits for confirmation, so
 * we report `'updating'` (a prompt follows) without reloading.
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
 * lack a browser reload button. Shows a checking spinner, then either the
 * "Update available" confirm prompt (new worker found) or an up-to-date /
 * unsupported / error message. Safe to call from any UI surface.
 */
export async function runUpdateCheck(): Promise<void> {
  // Desktop shell: no SW to compare against — check GitHub releases instead.
  if (isDesktopShell()) return runDesktopUpdateCheck()

  const { notify } = useStore.getState()
  const id = notify.start({ title: 'Checking for updates…', kind: 'progress' })
  notify.update(id, { progress: null }) // indeterminate spinner — no real % to report

  const res = await checkForUpdates()
  notify.dismiss(id)
  if (res === 'updating') {
    showUpdatePrompt()
  } else if (res === 'uptodate') {
    notify.start({ title: `You’re on the latest version (v${APP_VERSION})`, kind: 'info' })
  } else {
    notify.start({ title: 'Updates aren’t available in this environment', kind: 'info' })
  }
}
