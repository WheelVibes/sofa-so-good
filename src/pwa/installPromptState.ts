import { useSyncExternalStore } from 'react'

/**
 * PWA install-prompt state machine (R7-M / U2, mirrors `updateFlowState.ts`'s
 * shape exactly — a plain module-level signal for a value that changes far
 * more often than anything the Zustand store needs to react to, read via
 * `useSyncExternalStore`).
 *
 * `pwa/installPrompt.ts` is the sole writer; everything else only reads.
 */
export type InstallPromptState =
  /** No native install path is currently offered — covers "no
   *  `beforeinstallprompt` yet" (could still arrive later this session),
   *  "the browser doesn't support it" (Firefox/desktop Safari), and the
   *  terminal outcome of a failed/cancelled prompt() call. */
  | { type: 'unavailable' }
  /** `beforeinstallprompt` was captured and deferred — `promptInstall()` can
   *  show the browser's native install dialog on the next user gesture. */
  | { type: 'available' }
  /** `prompt()` has been called and the caller is waiting on `userChoice`. */
  | { type: 'prompting' }
  /** `userChoice` resolved `'accepted'`. */
  | { type: 'accepted' }
  /** `userChoice` resolved `'dismissed'` — the BROWSER's own native dialog was
   *  declined (distinct from our own banner's "Not now", which never reaches
   *  this state machine — see `installPrompt.ts`'s dismissal helpers). */
  | { type: 'dismissed' }
  /** `appinstalled` fired, OR the app detected at boot that it is already
   *  running standalone / already installed (`getInstalledRelatedApps`). */
  | { type: 'installed' }

let state: InstallPromptState = { type: 'unavailable' }
const listeners = new Set<() => void>()

export function getInstallPromptState(): InstallPromptState {
  return state
}

export function setInstallPromptState(next: InstallPromptState): void {
  state = next
  for (const fn of [...listeners]) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** React hook — re-renders the caller whenever the install-prompt stage changes. */
export function useInstallPromptState(): InstallPromptState {
  return useSyncExternalStore(subscribe, getInstallPromptState, getInstallPromptState)
}

declare global {
  interface Window {
    /** DEV-only test/scenario seam (mirrors `window.__updateFlow`): lets a
     *  Chrome-audit/shot.mjs scenario drive the install-prompt UI without a
     *  real installable build. Real browsers refuse to let a script dispatch
     *  a TRUSTED `beforeinstallprompt` (there is no constructor a page can
     *  invoke to make the browser itself decide installability), but our own
     *  listener in `installPrompt.ts` never checks `isTrusted`, so
     *  `simulateBeforeInstallPrompt` dispatches a plain `Event` of that type
     *  carrying stub `prompt()`/`userChoice` — the harness drives the REAL
     *  capture → defer → prompt code path, not just the visible state. */
    __installPrompt?: {
      get: () => InstallPromptState
      set: (next: InstallPromptState) => void
      simulateBeforeInstallPrompt: (outcome?: 'accepted' | 'dismissed') => void
    }
  }
}

/** Install the `window.__installPrompt` dev/test seam. No-op outside DEV or a
 *  non-DOM environment. Idempotent. */
export function installInstallPromptDevSeam(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  window.__installPrompt = {
    get: getInstallPromptState,
    set: setInstallPromptState,
    simulateBeforeInstallPrompt: (outcome = 'accepted') => {
      const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt?: () => Promise<void>
        userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
      }
      ev.prompt = () => Promise.resolve()
      ev.userChoice = Promise.resolve({ outcome, platform: 'web' })
      window.dispatchEvent(ev)
    },
  }
}
