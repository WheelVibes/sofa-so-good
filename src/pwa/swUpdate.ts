import { registerSW } from 'virtual:pwa-register'
import { isDesktopShell, runDesktopUpdateCheck } from '../desktop/updateCheck'
import { useStore } from '../state/store'
import { APP_VERSION, isNewerVersion } from '../version'
import { purgeRuntimeCachesOnVersionChange } from './cachePurge'
import {
  getUpdateFlowState,
  installUpdateFlowDevSeam,
  setUpdateFlowState,
  type UpdateFlowState,
} from './updateFlowState'

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
/** Guard so the auto-check wiring (register + on-open/periodic/foreground) is
 *  installed EXACTLY once — a second `registerAppServiceWorker()` (a stray
 *  remount/import, React StrictMode double-invoke of any caller) would
 *  otherwise stack a second interval + duplicate visibility/focus listeners,
 *  i.e. two concurrent auto-checks racing to notify. */
let swWired = false
/** In-flight guard for the manual PWA check — a repeated "Check for updates"
 *  press while one is still running is ignored, so N taps yield ONE spinner and
 *  ONE result instead of N stacked progress toasts. */
let manualCheckInFlight = false
/** Id of the live "Update available" prompt, so `showUpdatePrompt` only ever
 *  raises one. Its message is filled in asynchronously (the deployed version
 *  line), which mutates the toast's `message` and would otherwise dodge the
 *  notifications slice's kind+title+message de-dupe — letting a later call
 *  stack a second copy. See `showUpdatePrompt`. */
let updatePromptId: string | undefined

const HOUR_MS = 60 * 60 * 1000
const FOREGROUND_THROTTLE_MS = 60 * 1000

/** Register the service worker and wire the on-open + periodic + foreground
 *  update checks. A found update surfaces the confirm prompt, never an auto-reload. */
export function registerAppServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  if (swWired) return // exactly one auto-check — never wire a second interval/listeners
  swWired = true
  installUpdateFlowDevSeam(renderDevStageToast)
  // Runtime-cache purge (UPDATE-FLOW part B): on the first boot of a new
  // APP_VERSION, drop the shared-library/CC0/user-guide runtime caches so a
  // stale lightmap/GLB/texture/guide page can't survive a version bump — see
  // `cachePurge.ts` for why this can't be a service-worker `activate` hook.
  void purgeRuntimeCachesOnVersionChange(APP_VERSION)
  updateSW = registerSW({
    immediate: true,
    // A new worker has installed and is waiting — let the user apply it.
    onNeedRefresh() {
      showUpdatePrompt()
    },
    onRegisteredSW(_swUrl, r) {
      if (!r) return
      swReg = r
      // A worker can already be `waiting` right here: it finished installing in
      // a PREVIOUS session (e.g. an installed iOS Home-Screen PWA backgrounded
      // mid-precache) and `onNeedRefresh` only fires for a worker found DURING
      // this session, so that case would otherwise never prompt — the user sits
      // on a stale precache indefinitely. Surface it immediately.
      if (r.waiting) {
        showUpdatePrompt()
      } else if (r.installing) {
        // A download was already in flight when this session attached to the
        // registration (rare, but possible right after a fresh `register()`).
        trackInstallingWorker(r.installing)
      }
      // A new worker found DURING this session — reflect the download stage
      // for the update-flow state machine (the toast itself still only
      // appears once the worker reaches `waiting`, via `onNeedRefresh` above).
      r.addEventListener?.('updatefound', () => {
        if (r.installing) trackInstallingWorker(r.installing)
      })
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

/** Reflect a worker's install progress in the update-flow state machine —
 *  `downloading` (indeterminate: `generateSW` gives no byte/file count, see
 *  `updateFlowState.ts`) while installing, `ready` once it reaches `waiting`/
 *  `activated`, unchanged on `redundant` (the manual-check path already
 *  surfaces that as an error toast; the silent auto-check path simply drops
 *  it — nothing to show for a background failure with no request pending). */
function trackInstallingWorker(worker: ServiceWorker): void {
  setUpdateFlowState({ type: 'downloading', done: null, total: null })
  const onState = () => {
    if (worker.state === 'installed' || worker.state === 'activated') {
      worker.removeEventListener('statechange', onState)
      setUpdateFlowState({ type: 'ready' })
    } else if (worker.state === 'redundant') {
      worker.removeEventListener('statechange', onState)
    }
  }
  worker.addEventListener('statechange', onState)
}

/**
 * Surface the "Update available" toast — info kind, never auto-dismissing, with
 * an **Update** action that applies the waiting worker. The on-open, periodic,
 * foreground and manual checks can all call it freely: the notifications slice
 * de-dupes identical non-progress toasts (same kind+title+message), so a repeat
 * resurfaces the one prompt instead of stacking copies.
 */
export function showUpdatePrompt(): void {
  const store = useStore.getState()
  const { notify } = store
  // Only ever ONE live prompt. If the one we already raised is still on screen,
  // resurface nothing — bail. (Its message is mutated asynchronously below, so
  // relying on the slice's kind+title+message de-dupe alone would let a repeat
  // call stack a second copy once that version line has landed.)
  if (updatePromptId && store.notifications.some((n) => n.id === updatePromptId)) return
  const id = notify.start({
    title: 'New version available',
    kind: 'info',
    icon: 'Versions',
    autoDismissMs: null,
    actionLabel: 'Update',
    onAction: () => void applyUpdate(),
  })
  updatePromptId = id
  setUpdateFlowState({ type: 'ready' })
  // The running bundle only knows its own (older) APP_VERSION; fetch the freshly
  // deployed version.json over the network to show the version the waiting worker
  // will install. Fire-and-forget — the toast is already useful without it.
  void fetchDeployedVersion().then((v) => {
    if (v && isNewerVersion(v, APP_VERSION)) {
      notify.update(id, { message: `(v${v})` })
      setUpdateFlowState({ type: 'ready', version: v })
    }
  })
}

/** Fetch the deployed build's version from `version.json`, bypassing the SW
 *  precache (cache-busting query + `no-store`) so it reflects the NEW build on
 *  the server, not the stale copy the active worker still serves. Returns null
 *  on any failure — the prompt then simply shows no version line. */
async function fetchDeployedVersion(): Promise<string | null> {
  if (typeof fetch !== 'function') return null
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}version.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

/** localStorage flag: set just before an update reload so the freshly-booted
 *  build knows to surface a "you're now updated" success toast. */
const JUST_UPDATED_KEY = 'sofa.justUpdated'

/** Apply the waiting update: skip waiting + reload to the new version. Marks the
 *  reload so the new build can confirm the update once it finishes loading. */
async function applyUpdate(): Promise<void> {
  try {
    localStorage.setItem(JUST_UPDATED_KEY, '1')
  } catch {
    /* storage unavailable — the confirmation toast just won't show */
  }
  setUpdateFlowState({ type: 'reloading' })
  if (updateSW) {
    await updateSW(true)
  } else if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

/** True exactly once after an update reload (clears the flag). The caller shows
 *  a "Updated to v<version>" success toast when the fresh build is on screen. */
export function consumeJustUpdated(): boolean {
  try {
    if (localStorage.getItem(JUST_UPDATED_KEY) === '1') {
      localStorage.removeItem(JUST_UPDATED_KEY)
      return true
    }
  } catch {
    /* storage unavailable */
  }
  return false
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
  // (It owns its own in-flight guard, so don't hold this one across the hand-off.)
  if (isDesktopShell()) return runDesktopUpdateCheck()

  // Ignore repeat presses while a check is still running — one spinner, one
  // result. The stable-id `showUpdatePrompt` further guarantees at most one
  // "Update available" toast even across sequential checks.
  if (manualCheckInFlight) return
  manualCheckInFlight = true
  try {
    const { notify } = useStore.getState()
    setUpdateFlowState({ type: 'checking' })
    const id = notify.start({ title: 'Checking for updates…', kind: 'progress' })
    notify.update(id, { progress: null }) // indeterminate spinner — no real % to report

    // Fetch the deployed version.json (cache-busted, `no-store`) BEFORE/alongside
    // `registration.update()` below, so the "vX.Y.Z available" stage can be
    // announced the moment the target version is known, instead of waiting for
    // the service worker to finish downloading it. Non-blocking: this resolves
    // on its own timeline and only upgrades the still-running "Checking…" toast
    // when it lands ahead of detection (a slow network can have it land after).
    const remoteVersionPromise = fetchDeployedVersion()
    void remoteVersionPromise.then((v) => {
      if (!v || !isNewerVersion(v, APP_VERSION)) return
      notify.update(id, { title: `v${v} available`, message: `v${APP_VERSION} → v${v}` })
      // Forward-only: if detection already raced ahead to `downloading`/`ready`
      // by the time this (independent) fetch resolves, don't rewind the stage
      // — only announce `available` while still on `checking`/`available`.
      const cur = getUpdateFlowState()
      if (cur.type === 'checking' || cur.type === 'available') {
        setUpdateFlowState({ type: 'available', from: APP_VERSION, to: v })
      }
    })

    const reg = await resolveRegistration()
    const res = reg ? await detectUpdate(reg) : 'unsupported'

    if (res !== 'downloading') {
      notify.dismiss(id)
      if (res === 'waiting') {
        showUpdatePrompt() // downloaded earlier — ready to apply now
      } else if (res === 'uptodate') {
        setUpdateFlowState({ type: 'upToDate' })
        notify.start({ title: `You’re on the latest version (v${APP_VERSION})`, kind: 'info' })
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Reachable-network vs offline are different terminal states (the ask
        // is honest, distinct feedback rather than one generic failure) —
        // `navigator.onLine` is the only signal available here; it is a
        // best-effort/false-positive-prone browser API (it can read `true`
        // on a captive portal with no real route out), so this is a courtesy
        // label, not a guarantee.
        setUpdateFlowState({ type: 'offline' })
        notify.start({
          title: 'You’re offline',
          message: 'Connect to the internet and try again.',
          kind: 'info',
          icon: 'Alert',
          actionLabel: 'Retry',
          onAction: () => void runUpdateCheck(),
        })
      } else {
        setUpdateFlowState({ type: 'error', msg: 'Updates aren’t available in this environment' })
        notify.start({ title: 'Updates aren’t available in this environment', kind: 'info' })
      }
      return
    }

    // New worker found fast — keep the one progress toast, upgraded to the
    // download phase, while Workbox precaches the new build. `generateSW`
    // (this app's Workbox strategy) exposes no byte/file count for that
    // precache, so the bar stays indeterminate — see `updateFlowState.ts`.
    setUpdateFlowState({ type: 'downloading', done: null, total: null })
    notify.update(id, { title: 'New version — downloading…' })
    const outcome = reg ? await waitForInstallOutcome(reg) : 'failed'
    if (outcome === 'waiting') {
      notify.dismiss(id)
      showUpdatePrompt()
    } else {
      setUpdateFlowState({ type: 'error', msg: 'The update failed to download' })
      notify.error(id, 'The update failed to download — check your connection and try again.')
    }
  } finally {
    manualCheckInFlight = false
  }
}

/**
 * DEV-only: render the toast a real check would show for a given update-flow
 * stage, without touching the service worker or network at all — this is what
 * `window.__updateFlow.set(state)` drives (see `updateFlowState.ts`), so a
 * puppeteer/Chrome-audit scenario can screenshot the REAL rendered UI for
 * every stage (checking / available / downloading / ready / offline / error /
 * reloading) without needing a real installed worker or a mocked
 * `version.json`. Production code paths above never call this directly —
 * they build each toast inline, close to the state transition that earns it.
 */
/** Live across `renderDevStageToast` calls so `checking` → `available` →
 *  `downloading` transitions IN PLACE on one progress toast — exactly what
 *  `runUpdateCheck` does with its own `id` — instead of a fresh call per
 *  stage stacking three separate toasts (which would misrepresent the real
 *  single-toast UX in a scenario screenshot). Reset to `undefined` on every
 *  terminal stage. */
let devToastId: string | undefined

function renderDevStageToast(state: UpdateFlowState): void {
  const { notify } = useStore.getState()
  const isLive = () =>
    devToastId !== undefined && useStore.getState().notifications.some((n) => n.id === devToastId)
  // Every TERMINAL stage below replaces the running progress toast rather than
  // stacking beside it — mirroring `runUpdateCheck`'s own `notify.dismiss(id)`
  // before `showUpdatePrompt()`/the error toast, so a scenario driving these
  // stages one after another (screenshotting each) sees the same single-toast
  // UX a real check produces, not several toasts piled on top of each other.
  const dismissLive = () => {
    if (isLive()) notify.dismiss(devToastId!)
    devToastId = undefined
  }
  switch (state.type) {
    case 'checking': {
      devToastId = notify.start({ title: 'Checking for updates…', kind: 'progress' })
      notify.update(devToastId, { progress: null })
      break
    }
    case 'available': {
      if (!isLive()) devToastId = notify.start({ title: '', kind: 'progress' })
      notify.update(devToastId!, {
        title: `v${state.to} available`,
        message: `v${state.from} → v${state.to}`,
        progress: null,
      })
      break
    }
    case 'downloading': {
      if (!isLive()) devToastId = notify.start({ title: '', kind: 'progress' })
      notify.update(devToastId!, { title: 'New version — downloading…', progress: null })
      break
    }
    case 'ready':
      dismissLive()
      showUpdatePrompt()
      break
    case 'reloading':
      dismissLive()
      notify.start({
        title: 'Updating…',
        message: 'Reloading to the new version.',
        kind: 'progress',
      })
      break
    case 'upToDate':
      dismissLive()
      notify.start({ title: `You’re on the latest version (v${APP_VERSION})`, kind: 'info' })
      break
    case 'offline':
      dismissLive()
      notify.start({
        title: 'You’re offline',
        message: 'Connect to the internet and try again.',
        kind: 'info',
        icon: 'Alert',
        actionLabel: 'Retry',
        onAction: () => void runUpdateCheck(),
      })
      break
    case 'error':
      dismissLive()
      notify.start({ title: 'Update failed', message: state.msg, kind: 'error' })
      break
    case 'idle':
      dismissLive()
      break
  }
}
