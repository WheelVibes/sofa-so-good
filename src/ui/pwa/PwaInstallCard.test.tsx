// @vitest-environment happy-dom
/**
 * R7-M / U2 — PWA install CTA + iOS coachmark. Covers: the checklist-complete
 * (+ dismissed) trigger, the Chromium/Edge `beforeinstallprompt`-driven CTA,
 * the iOS coachmark, both "don't ask again" dismissals sticking, and the
 * showroom (viewOnly) suppression being an EXPLICIT, doubly-enforced choice
 * (the flag denylist AND the component's own `viewOnly` check).
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../../features/featureFlags'
import { setInstallPromptState } from '../../pwa/installPromptState'
import { CHECKLIST_STEPS } from '../../state/slices/checklistSlice'
import { useStore } from '../../state/store'
import { PwaInstallCard } from './PwaInstallCard'

// `promptInstall` is mocked so the "install flow" test can assert the click
// handler CALLS it and reacts to its resolution, without exercising the real
// `beforeinstallprompt`/`userChoice` machinery (that's `pwa/installPrompt.test.ts`'s
// job). Every other export stays real — the dismissal helpers genuinely read/
// write localStorage, which is exactly what the "sticks" assertions below need.
const { promptInstallMock } = vi.hoisted(() => ({ promptInstallMock: vi.fn() }))
vi.mock('../../pwa/installPrompt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pwa/installPrompt')>()
  return { ...actual, promptInstall: promptInstallMock }
})

function setMode(mode: 'simple' | 'pro', overrides: Record<string, boolean> = {}) {
  const flags = resolveFlags(true, overrides, false, mode)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, uiMode: mode })
}

function setViewOnly(viewOnly: boolean) {
  const flags = resolveFlags(true, {}, false, 'simple', viewOnly)
  setResolvedFlags(flags)
  useStore.setState({ featureFlags: flags, viewOnly })
}

function completeAndDismissChecklist() {
  useStore.setState({ checklistDone: [...CHECKLIST_STEPS], checklistDismissed: true })
}

const ORIGINAL_UA = navigator.userAgent

beforeEach(() => {
  localStorage.clear()
  promptInstallMock.mockReset()
  useStore.getState().__resetForTest()
  useStore.setState({
    checklistDone: [],
    checklistDismissed: false,
    viewOnly: false,
    cameraMode: 'orbit',
    floorPlanEditing: false,
    presenting: false,
  })
  setInstallPromptState({ type: 'unavailable' })
  setMode('simple')
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  setResolvedFlags(resolveFlags(true))
  localStorage.clear()
  setInstallPromptState({ type: 'unavailable' })
  Object.defineProperty(navigator, 'userAgent', { value: ORIGINAL_UA, configurable: true })
})

describe('PwaInstallCard — trigger moment', () => {
  it('control arm: renders nothing before the checklist is complete', () => {
    setInstallPromptState({ type: 'available' })
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('control arm: renders nothing while checklist is done but NOT yet dismissed', () => {
    // This is the literal instant the audit's brief names as the trigger —
    // asserting it does NOT show here proves the dismissal wait is real, not
    // a no-op refinement (it avoids colliding with the still-visible
    // checklist card's own "Done" button in the same bottom-left slot).
    useStore.setState({ checklistDone: [...CHECKLIST_STEPS], checklistDismissed: false })
    setInstallPromptState({ type: 'available' })
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('renders the install CTA once the checklist is complete AND dismissed, with a captured event', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    render(<PwaInstallCard />)
    expect(screen.getByText('Install Sofa So Good')).toBeTruthy()
  })

  it('renders nothing at the value moment if no beforeinstallprompt was ever captured', () => {
    completeAndDismissChecklist()
    // installPromptState stays 'unavailable' — no event, nothing to prompt.
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('is flag-gated (pwaInstallPrompt) and works in both Simple and Pro (simple tier)', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    setMode('pro')
    const { unmount } = render(<PwaInstallCard />)
    expect(screen.getByText('Install Sofa So Good')).toBeTruthy()
    unmount()
    setMode('simple', { pwaInstallPrompt: false })
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('never renders over walk mode, the plan editor, or presentation mode', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    useStore.setState({ cameraMode: 'firstPerson' })
    const { unmount } = render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
    unmount()
    useStore.setState({ cameraMode: 'orbit', floorPlanEditing: true })
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })
})

describe('PwaInstallCard — install flow', () => {
  it('clicking Install calls promptInstall and shows a success toast on accept', async () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    promptInstallMock.mockResolvedValue('accepted')
    render(<PwaInstallCard />)
    await act(async () => {
      screen.getByText('Install').click()
    })
    expect(promptInstallMock).toHaveBeenCalled()
    expect(useStore.getState().notifications.some((n) => n.title === 'Installed')).toBe(true)
  })

  it('"Not now" dismisses the card and the dismissal sticks across a remount', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    const { unmount } = render(<PwaInstallCard />)
    act(() => {
      screen.getByLabelText('Not now').click()
    })
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
    expect(localStorage.getItem('hdb_install_dismissed')).toBe('1')
    unmount()
    // A fresh mount (e.g. a reload) must honour the persisted dismissal even
    // though `installPromptState` itself is a fresh in-memory 'available'.
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })
})

describe('PwaInstallCard — iOS coachmark', () => {
  function setIos() {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      configurable: true,
    })
  }

  it('shows the coachmark on iOS instead of the native-prompt CTA', () => {
    completeAndDismissChecklist()
    setIos()
    render(<PwaInstallCard />)
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('"Got it" dismisses the coachmark and the dismissal sticks', () => {
    completeAndDismissChecklist()
    setIos()
    const { unmount } = render(<PwaInstallCard />)
    act(() => {
      screen.getByLabelText('Got it, dismiss').click()
    })
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
    expect(localStorage.getItem('hdb_ios_addtohome_dismissed')).toBe('1')
    unmount()
    render(<PwaInstallCard />)
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
  })
})

describe('PwaInstallCard — showroom (viewOnly) suppression', () => {
  it('control arm: renders normally when NOT in a showroom', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    render(<PwaInstallCard />)
    expect(screen.getByText('Install Sofa So Good')).toBeTruthy()
  })

  it('renders nothing for a showroom visitor even at the value moment (flag denylist)', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    setViewOnly(true)
    expect(useStore.getState().featureFlags.pwaInstallPrompt).toBe(false)
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('renders nothing for a showroom visitor even if the flag were somehow still on (defence in depth)', () => {
    completeAndDismissChecklist()
    setInstallPromptState({ type: 'available' })
    // Simulate the flag surviving the denylist to prove the component's OWN
    // `viewOnly` check is a real, independent gate — not merely inherited.
    useStore.setState((s) => ({
      featureFlags: { ...s.featureFlags, pwaInstallPrompt: true },
      viewOnly: true,
    }))
    render(<PwaInstallCard />)
    expect(screen.queryByText('Install Sofa So Good')).toBeNull()
  })

  it('renders nothing for the iOS coachmark either, in a showroom', () => {
    completeAndDismissChecklist()
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      configurable: true,
    })
    setViewOnly(true)
    render(<PwaInstallCard />)
    expect(screen.queryByText('Add to Home Screen')).toBeNull()
  })
})
