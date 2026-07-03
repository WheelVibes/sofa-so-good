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

export type UpdateCheckResult = 'downloading' | 'waiting' | 'uptodate' | 'unsupported'

/** How long the manual check waits for the browser to DETECT a new worker
 *  before reporting "up to date". The detection itself (sw.js fetch +
 *  byte-compare) is fast; 10s only elapses on a stalled network. If a worker
 *  does turn up after the timeout, the plugin's `onNeedRefresh` still surfaces
 *  the prompt, so nothing is lost — we just stop the spinner honestly. */
const DETECT_TIMEOUT_MS = 10_000

async function resolveRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
  try {
    return swReg ?? (await navigator.serviceWorker.getRegistration())
  } catch {
    return undefined
  }
}

/**
 * DETECTION phase — fast. Kicks off `reg.update()` but does NOT wait for it to
 * settle when a new worker exists: in Chromium `update()` only resolves after
 * the new worker finishes INSTALLING, and install = Workbox precaching the
 * whole build (tens of MB) — that's the DOWNLOAD phase, not the check. Instead
 * we race:
 *
 *  - `reg.waiting` already set  → `'waiting'` (downloaded earlier, ready now)
 *  - `updatefound` / `reg.installing` → `'downloading'` (new worker found;
 *    fires as soon as the byte-compare sees a different sw.js)
 *  - `update()` resolving with no new worker → `'uptodate'`
 *  - `update()` rejecting → `'unsupported'` (offline / SW disabled)
 *  - `DETECT_TIMEOUT_MS` with none of the above → `'uptodate'` (see above)
 */
async function detectUpdate(reg: ServiceWorkerRegistration): Promise<UpdateCheckResult> {
  if (reg.waiting) return 'waiting'
  if (reg.installing) return 'downloading'
  return new Promise((resolve) => {
    let done = false
    const finish = (r: UpdateCheckResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      reg.removeEventListener('updatefound', onFound)
      resolve(r)
    }
    const onFound = () => finish('downloading')
    reg.addEventListener('updatefound', onFound)
    const timer = setTimeout(
      () => finish(reg.installing ? 'downloading' : 'uptodate'),
      DETECT_TIMEOUT_MS,
    )
    reg.update().then(
      // No new worker → the check settled fast; a new worker resolves this
      // long after `updatefound` already finished the race (ignored via `done`).
      () => finish(reg.waiting ? 'waiting' : reg.installing ? 'downloading' : 'uptodate'),
      () => finish('unsupported'),
    )
  })
}

/**
 * DOWNLOAD phase — waits for the found worker's install to reach a terminal
 * state. `'waiting'` = installed and ready to prompt (never offer the Update
 * button before this); `'failed'` = the browser marked it redundant (install
 * error / failed precache). The browser guarantees one of the two eventually
 * fires, so the caller's progress toast can't wedge.
 */
function waitForInstallOutcome(reg: ServiceWorkerRegistration): Promise<'waiting' | 'failed'> {
  return new Promise((resolve) => {
    const worker = reg.installing
    if (!worker) {
      resolve(reg.waiting ? 'waiting' : 'failed')
      return
    }
    const onState = () => {
      // 'installed' = reached waiting; 'activated' covers a first-ever install
      // taking over directly (no prior active worker) — prompt either way.
      if (worker.state === 'installed' || worker.state === 'activated') {
        worker.removeEventListener('statechange', onState)
        resolve('waiting')
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onState)
        resolve('failed')
      }
    }
    worker.addEventListener('statechange', onState)
    onState() // the worker may already be past installing
  })
}

/**
 * Force an update check now — DETECTION only, resolves fast. `'downloading'`
 * means a new worker was found and is installing (a prompt follows once it's
 * waiting); `'waiting'` means one is already installed and ready.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const reg = await resolveRegistration()
  if (!reg) return 'unsupported'
  return detectUpdate(reg)
}

/**
 * Manual "Check for updates" with PHASED toast feedback — for Home-Screen PWAs
 * that lack a browser reload button. Shows a checking spinner; on fast
 * detection it either reports up-to-date / unsupported, jumps straight to the
 * "Update available" prompt (worker already waiting), or upgrades the spinner
 * to "Update available — downloading…" while the new worker precaches, then
 * prompts when it reaches waiting (or errors if the install fails). Every path
 * ends the progress toast. Safe to call from any UI surface.
 */
export async function runUpdateCheck(): Promise<void> {
  // Desktop shell: no SW to compare against — check GitHub releases instead.
  if (isDesktopShell()) return runDesktopUpdateCheck()

  const { notify } = useStore.getState()
  const id = notify.start({ title: 'Checking for updates…', kind: 'progress' })
  notify.update(id, { progress: null }) // indeterminate spinner — no real % to report

  const reg = await resolveRegistration()
  const res = reg ? await detectUpdate(reg) : 'unsupported'

  if (res !== 'downloading') {
    notify.dismiss(id)
    if (res === 'waiting') {
      showUpdatePrompt() // downloaded earlier — ready to apply now
    } else if (res === 'uptodate') {
      notify.start({ title: `You’re on the latest version (v${APP_VERSION})`, kind: 'info' })
    } else {
      notify.start({ title: 'Updates aren’t available in this environment', kind: 'info' })
    }
    return
  }

  // New worker found fast — keep the one progress toast, upgraded to the
  // download phase, while Workbox precaches the new build.
  notify.update(id, { title: 'Update available — downloading…' })
  const outcome = reg ? await waitForInstallOutcome(reg) : 'failed'
  if (outcome === 'waiting') {
    notify.dismiss(id)
    showUpdatePrompt()
  } else {
    notify.error(id, 'The update failed to download — check your connection and try again.')
  }
}
