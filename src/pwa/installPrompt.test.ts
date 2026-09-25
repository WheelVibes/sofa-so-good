// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function setStandalone(matches: boolean) {
  window.matchMedia = (query: string) =>
    ({ matches: matches && query === '(display-mode: standalone)' }) as MediaQueryList
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

/** Dispatch a fake `beforeinstallprompt` the way a real browser would — a
 *  plain Event with `prompt()`/`userChoice` attached, matching the shape
 *  `installPromptState.ts`'s own dev seam uses for the harness. The
 *  `preventDefault` spy is attached BEFORE dispatch so a caller can assert
 *  the listener actually suppressed the browser's own install UI. */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt?: () => Promise<void>
    userChoice?: Promise<{ outcome: string; platform: string }>
  }
  ev.prompt = vi.fn().mockResolvedValue(undefined)
  ev.userChoice = Promise.resolve({ outcome, platform: 'web' })
  const preventDefaultSpy = vi.spyOn(ev, 'preventDefault')
  window.dispatchEvent(ev)
  return { ev, preventDefaultSpy }
}

/**
 * `installPrompt.ts` guards its wiring with a MODULE-LEVEL `wired` flag (like
 * `swUpdate.ts`'s `swWired`) and reads `isStandaloneDisplayMode()`/
 * `getInstalledRelatedApps()` exactly once, at `wireInstallPrompt()` time — so
 * every test that exercises boot-time behaviour needs a FRESH module instance,
 * not just a fresh call. `vi.resetModules()` clears the whole registry,
 * including the `installPromptState.ts` module `installPrompt.ts` imports
 * internally, so both must be re-imported dynamically together — a leftover
 * static top-level import of `installPromptState` would silently read a
 * DIFFERENT (stale, pre-reset) module instance than the one `installPrompt.ts`
 * is actually writing to.
 */
async function freshModules() {
  vi.resetModules()
  const state = await import('./installPromptState')
  const mod = await import('./installPrompt')
  return { state, mod }
}

const ORIGINAL_UA = navigator.userAgent

beforeEach(() => {
  localStorage.clear()
  setStandalone(false)
  setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')
})

afterEach(() => {
  setUserAgent(ORIGINAL_UA)
  vi.unstubAllGlobals()
})

describe('wireInstallPrompt', () => {
  it('captures a real beforeinstallprompt, prevents the default UI, and defers it', async () => {
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    const { preventDefaultSpy } = fireBeforeInstallPrompt()
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(state.getInstallPromptState()).toEqual({ type: 'available' })
  })

  it('resolves already-standalone at boot and never reaches available', async () => {
    setStandalone(true)
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    expect(state.getInstallPromptState()).toEqual({ type: 'installed' })
    fireBeforeInstallPrompt()
    // Standalone bailed out before any listener was wired — dispatching the
    // event afterwards must not flip the state back to 'available'.
    expect(state.getInstallPromptState()).toEqual({ type: 'installed' })
  })

  it('resolves already-installed via getInstalledRelatedApps', async () => {
    const { state, mod } = await freshModules()
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
    nav.getInstalledRelatedApps = vi.fn().mockResolvedValue([{ platform: 'webapp' }])
    try {
      mod.wireInstallPrompt()
      await vi.waitFor(() => {
        expect(state.getInstallPromptState()).toEqual({ type: 'installed' })
      })
    } finally {
      nav.getInstalledRelatedApps = undefined
    }
  })

  it('ignores an unsupported/rejecting getInstalledRelatedApps and still captures the event', async () => {
    const { state, mod } = await freshModules()
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
    nav.getInstalledRelatedApps = vi.fn().mockRejectedValue(new Error('unsupported'))
    try {
      mod.wireInstallPrompt()
      fireBeforeInstallPrompt()
      expect(state.getInstallPromptState()).toEqual({ type: 'available' })
    } finally {
      nav.getInstalledRelatedApps = undefined
    }
  })

  it('is idempotent — a second call does not re-wire a second listener pair', async () => {
    const { mod } = await freshModules()
    mod.wireInstallPrompt()
    mod.wireInstallPrompt()
    fireBeforeInstallPrompt()
    // A duplicated listener would still only ever store ONE deferred event
    // (the second handler just overwrites it with the same reference), so
    // the observable check is that a single promptInstall() call resolves
    // cleanly instead of throwing or double-consuming.
    const outcome = await mod.promptInstall()
    expect(outcome).toBe('accepted')
  })

  it('appinstalled clears the deferred prompt and marks installed', async () => {
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    fireBeforeInstallPrompt()
    expect(state.getInstallPromptState()).toEqual({ type: 'available' })
    window.dispatchEvent(new Event('appinstalled'))
    expect(state.getInstallPromptState()).toEqual({ type: 'installed' })
    // The deferred event was cleared — a subsequent prompt() attempt reports
    // unavailable rather than replaying a stale, already-resolved event.
    const outcome = await mod.promptInstall()
    expect(outcome).toBe('unavailable')
  })
})

describe('promptInstall', () => {
  it('returns unavailable with no captured event', async () => {
    const { mod } = await freshModules()
    mod.wireInstallPrompt()
    expect(await mod.promptInstall()).toBe('unavailable')
  })

  it('accepted: transitions available -> prompting -> accepted, single-use event', async () => {
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    fireBeforeInstallPrompt('accepted')
    const promise = mod.promptInstall()
    expect(state.getInstallPromptState()).toEqual({ type: 'prompting' })
    expect(await promise).toBe('accepted')
    expect(state.getInstallPromptState()).toEqual({ type: 'accepted' })
    // Single-use: a second call has nothing left to prompt.
    expect(await mod.promptInstall()).toBe('unavailable')
  })

  it('dismissed: persists the "don\'t ask again" flag', async () => {
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    fireBeforeInstallPrompt('dismissed')
    expect(await mod.promptInstall()).toBe('dismissed')
    expect(state.getInstallPromptState()).toEqual({ type: 'dismissed' })
    expect(mod.isInstallCtaDismissed()).toBe(true)
  })

  it('a rejected prompt() call reports unavailable and clears the event', async () => {
    const { state, mod } = await freshModules()
    mod.wireInstallPrompt()
    const ev = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt?: () => Promise<void>
    }
    ev.prompt = vi.fn().mockRejectedValue(new Error('not a user gesture'))
    window.dispatchEvent(ev)
    expect(await mod.promptInstall()).toBe('unavailable')
    expect(state.getInstallPromptState()).toEqual({ type: 'unavailable' })
  })
})

describe('dismissal persistence', () => {
  it('isInstallCtaDismissed / dismissInstallCta round-trip via localStorage', async () => {
    const { mod } = await freshModules()
    expect(mod.isInstallCtaDismissed()).toBe(false)
    mod.dismissInstallCta()
    expect(mod.isInstallCtaDismissed()).toBe(true)
    expect(localStorage.getItem('hdb_install_dismissed')).toBe('1')
  })

  it('isIosCoachmarkDismissed / dismissIosCoachmark round-trip via localStorage', async () => {
    const { mod } = await freshModules()
    expect(mod.isIosCoachmarkDismissed()).toBe(false)
    mod.dismissIosCoachmark()
    expect(mod.isIosCoachmarkDismissed()).toBe(true)
    expect(localStorage.getItem('hdb_ios_addtohome_dismissed')).toBe('1')
  })
})

describe('shouldOfferIosCoachmark', () => {
  it('true on iOS, not standalone', async () => {
    const { mod } = await freshModules()
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    setStandalone(false)
    expect(mod.shouldOfferIosCoachmark()).toBe(true)
  })

  it('false on iOS once running standalone (already installed)', async () => {
    const { mod } = await freshModules()
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
    setStandalone(true)
    expect(mod.shouldOfferIosCoachmark()).toBe(false)
  })

  it('false on non-iOS platforms (control arm — proves the gate is really iOS-specific)', async () => {
    const { mod } = await freshModules()
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')
    setStandalone(false)
    expect(mod.shouldOfferIosCoachmark()).toBe(false)
  })
})
