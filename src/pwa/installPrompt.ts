import { isIos, isStandaloneDisplayMode } from '../utils/platform'
import { installInstallPromptDevSeam, setInstallPromptState } from './installPromptState'

/**
 * Custom PWA install CTA (R7-M / U2, product audit `docs/audit/
 * product-ux-2026-09-25.md` §5 brief 3 — see `docs/developer/pwa-install.md`
 * for the full research + design writeup and citations).
 *
 * `swUpdate.ts` already owns the service-worker registration + update flow;
 * this is the SEPARATE, much smaller install-affordance machinery the audit
 * found missing entirely (`grep -r beforeinstallprompt src/` was empty). It
 * follows the exact same shape on purpose:
 *
 *  1. wire the event listeners once (`wireInstallPrompt`, called from
 *     `main.tsx` next to `registerAppServiceWorker`),
 *  2. capture + `preventDefault()` the browser's `beforeinstallprompt` and
 *     stash it — the event can only be used ONCE and only from a user
 *     gesture, so nothing here calls `.prompt()` on its own,
 *  3. expose state through `installPromptState.ts` for a UI component to
 *     render a CTA at a moment IT chooses (never on capture),
 *  4. `promptInstall()` is the one function a click handler calls.
 *
 * This module never decides WHEN to show anything — `ui/pwa/PwaInstallCard.tsx`
 * owns that (gated on the getting-started-checklist-complete signal, and
 * explicitly suppressed for showroom visitors — see that file's doc comment).
 */

/** Not in `lib.dom.d.ts` — Chromium-only, `Baseline`-negative per MDN (2026). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

let deferredPrompt: BeforeInstallPromptEvent | undefined
let wired = false

const INSTALL_DISMISSED_KEY = 'hdb_install_dismissed'
const IOS_COACHMARK_DISMISSED_KEY = 'hdb_ios_addtohome_dismissed'

/**
 * Register the `beforeinstallprompt`/`appinstalled` listeners and resolve the
 * already-installed case. Guarded so a stray remount can't wire a second pair
 * of listeners (the same `swWired` shape `swUpdate.ts` uses).
 */
export function wireInstallPrompt(): void {
  if (typeof window === 'undefined') return
  if (wired) return
  wired = true
  installInstallPromptDevSeam()

  // Already running standalone (installed, launched from the home screen /
  // app list) — never offer to install an app that is already installed.
  // Checked FIRST and unconditionally: no listener is worth wiring for a
  // session that can't possibly receive `beforeinstallprompt` anyway (a
  // standalone window is, by definition, already past that point).
  if (isStandaloneDisplayMode()) {
    setInstallPromptState({ type: 'installed' })
    return
  }

  // Best-effort second signal: `getInstalledRelatedApps()` can report the PWA
  // itself already installed via a self-referencing `related_applications`
  // entry (needs a manifest `id` + entry this app doesn't yet declare — see
  // the developer doc) or a listed native companion app. Experimental /
  // limited availability (MDN, 2026) — feature-detected and wrapped so its
  // absence or a rejected promise (permission, unsupported) simply falls
  // through to the normal capture path below.
  type NavigatorWithRelatedApps = Navigator & {
    getInstalledRelatedApps?: () => Promise<unknown[]>
  }
  const nav = navigator as NavigatorWithRelatedApps
  if (typeof nav.getInstalledRelatedApps === 'function') {
    void nav
      .getInstalledRelatedApps()
      .then((related) => {
        if (Array.isArray(related) && related.length > 0) {
          setInstallPromptState({ type: 'installed' })
        }
      })
      .catch(() => {
        /* unsupported / permission-denied — no-op, capture path still wires below */
      })
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Only a real browser-generated event in production. `simulateBeforeInstallPrompt`
    // (installPromptState.ts) dispatches a plain, untrusted `Event` so the harness can
    // drive the card, and that seam is already DEV-gated — but the listener's own
    // permissiveness used to ship, letting any script executing in the page (injected
    // third party, content script, XSS) raise the install card at a moment the app did
    // not choose and hand it an attacker-controlled `prompt()`/`userChoice`, up to a
    // lying "Installed" toast. DEV keeps accepting synthetic events, so nothing is lost.
    if (!import.meta.env.DEV && !e.isTrusted) return
    // The browser is offering to show its own mini-infobar/install icon —
    // defer it (never let the browser's own UI appear either) so the ONLY
    // prompt a user ever sees is the one `PwaInstallCard` decides to trigger.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    setInstallPromptState({ type: 'available' })
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = undefined
    setInstallPromptState({ type: 'installed' })
  })
}

/**
 * Show the browser's native install dialog. MUST be called from a user
 * gesture (a click handler) — `prompt()` throws otherwise. Returns the
 * outcome so the caller can react (e.g. a toast), though `installPromptState`
 * already reflects it for any other subscriber.
 *
 * The captured event is single-use per spec: it is cleared here regardless of
 * outcome, so a second click without a fresh `beforeinstallprompt` correctly
 * reports `'unavailable'` rather than silently doing nothing.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  deferredPrompt = undefined
  setInstallPromptState({ type: 'prompting' })
  try {
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') {
      setInstallPromptState({ type: 'accepted' })
      return 'accepted'
    }
    // The browser's own dialog was declined — per web.dev's guidance, don't
    // nag again this browser: persist the same "don't ask again" dismissal a
    // deliberate close of our own card would.
    dismissInstallCta()
    setInstallPromptState({ type: 'dismissed' })
    return 'dismissed'
  } catch {
    setInstallPromptState({ type: 'unavailable' })
    return 'unavailable'
  }
}

/** "Don't ask again" for the install CTA — set on an explicit "Not now" close
 *  of our own card AND on a declined native prompt (see `promptInstall`).
 *  Mirrors `hdb_onboarded`'s plain-string localStorage pattern. */
export function isInstallCtaDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissInstallCta(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
  } catch {
    /* private mode / quota — the card just won't remember; low stakes */
  }
}

/** Same "don't ask again" shape for the iOS coachmark, which has no
 *  `installPromptState` transition to key off (there is no event) — it is a
 *  fully independent dismissal keyed by its own localStorage flag. */
export function isIosCoachmarkDismissed(): boolean {
  try {
    return localStorage.getItem(IOS_COACHMARK_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissIosCoachmark(): void {
  try {
    localStorage.setItem(IOS_COACHMARK_DISMISSED_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

/** True when the iOS coachmark is the right (and only possible) affordance:
 *  iOS never fires `beforeinstallprompt` (Safari has never implemented it —
 *  see the developer doc's citations), so this is the sole check — no
 *  `installPromptState` gate applies here since that state machine only ever
 *  reaches `'available'` on a browser that DOES fire the event. */
export function shouldOfferIosCoachmark(): boolean {
  return isIos() && !isStandaloneDisplayMode()
}
