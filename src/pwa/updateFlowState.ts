import { useSyncExternalStore } from 'react'

/**
 * Granular "Check for updates" state machine (UPDATE-FLOW).
 *
 * `swUpdate.ts` used to communicate progress ENTIRELY through the notifications
 * slice's ad-hoc toast title strings ("Checking for updates…" → "New version —
 * downloading…" → "New version available"), which is fine for the toast copy
 * but gives nothing else (a test, a dev seam, a future non-toast surface) a
 * structured read of where the flow actually is. This module is that
 * structured read — a plain module-level signal (the pattern `renderPumpSignal.ts`/
 * `shadowRefreshSignal.ts` use for a DOM/render-loop value with no natural home in
 * the Zustand store: it changes far more often than anything persisted, and no
 * slice needs to react to it in a way `useStore.subscribe` wiring would help with).
 *
 * `swUpdate.ts` remains the sole writer; everything else only reads.
 */
export type UpdateFlowState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'upToDate' }
  /** The deployed build's version.json was fetched and is newer than the
   *  running build, but the service worker hasn't necessarily started (or
   *  finished) downloading it yet — this is the "vX.Y.Z available" stage,
   *  fired BEFORE `registration.update()` so the UI can announce the target
   *  version immediately instead of waiting for the install to complete. */
  | { type: 'available'; from: string; to: string }
  /** A new worker is installing. `generateSW` (this app's Workbox strategy —
   *  see `vite.config.ts`) exposes no precache byte/file count, so `done`/
   *  `total` are always `null` here: the caller must render an indeterminate
   *  bar, never a percentage. The field shape is kept (rather than a bare
   *  `'downloading'` literal) so a future `injectManifest` migration — which
   *  COULD report real counts via `postMessage` — is a non-breaking change. */
  | { type: 'downloading'; done: number | null; total: number | null }
  /** Installed and waiting — ready for the user to apply (skipWaiting + reload). */
  | { type: 'ready'; version?: string }
  /** `applyUpdate()` has told the waiting worker to take over; the page is
   *  about to reload to the new version. */
  | { type: 'reloading' }
  /** The check could not reach the network (the fetch/`update()` call failed
   *  while the browser reports itself offline) — distinct from `error`, which
   *  covers a reachable-but-failed install. */
  | { type: 'offline' }
  | { type: 'error'; msg: string }

let state: UpdateFlowState = { type: 'idle' }
const listeners = new Set<() => void>()

export function getUpdateFlowState(): UpdateFlowState {
  return state
}

export function setUpdateFlowState(next: UpdateFlowState): void {
  state = next
  for (const fn of [...listeners]) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** React hook — re-renders the caller whenever the update-flow stage changes. */
export function useUpdateFlowState(): UpdateFlowState {
  return useSyncExternalStore(subscribe, getUpdateFlowState, getUpdateFlowState)
}

declare global {
  interface Window {
    /** DEV-only test/scenario seam (UPDATE-FLOW): lets a puppeteer/Chrome-audit
     *  scenario or a manual console poke drive every stage of the update UI
     *  without a real service worker / network mock. Never installed in prod —
     *  see `installUpdateFlowDevSeam`. */
    __updateFlow?: {
      get: () => UpdateFlowState
      set: (next: UpdateFlowState) => void
    }
  }
}

/** Install the `window.__updateFlow` dev/test seam. No-op outside DEV or a
 *  non-DOM environment (SSR/test without `window`). Idempotent.
 *
 * `onSet`, if given, runs AFTER every `set()` call with the new state — this is
 * how `swUpdate.ts` wires the seam to also render the real toast a given
 * stage would produce (see `renderDevStageToast`), so a scenario driving
 * `window.__updateFlow.set({type:'downloading', ...})` sees the actual
 * rendered UI for that stage, not just the invisible signal. */
export function installUpdateFlowDevSeam(onSet?: (next: UpdateFlowState) => void): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  window.__updateFlow = {
    get: getUpdateFlowState,
    set: (next) => {
      setUpdateFlowState(next)
      onSet?.(next)
    },
  }
}
