// @vitest-environment happy-dom
/**
 * UIUX-3: custom `.modal-overlay` dialogs that don't build on the shared
 * `Modal` must register with the modal guard (suppressing global hotkeys) and
 * manage focus (move focus in on open, restore on close) — see A11Y-MODAL-MENU
 * in `src/ui/CLAUDE.md`. LocationPrompt is the first-run one.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isAnyModalOpen, resetModalGuardForTests } from '../controls/modalGuard'
import { useStore } from '../state/store'
import { LocationPrompt } from './LocationPrompt'

beforeEach(() => {
  useStore.getState().__resetForTest()
  resetModalGuardForTests()
  // Make the prompt eligible: no location, not dismissed, no first-run overlays.
  useStore.setState({
    location: null,
    locationPromptDismissed: false,
    onboardingOpen: false,
    tourOpen: false,
  })
})
afterEach(() => {
  cleanup()
  resetModalGuardForTests()
})

describe('LocationPrompt modal-guard + focus (UIUX-3)', () => {
  it('registers with the modal guard while open and releases on unmount', () => {
    expect(isAnyModalOpen()).toBe(false)
    const { unmount } = render(<LocationPrompt />)
    expect(isAnyModalOpen()).toBe(true)
    unmount()
    expect(isAnyModalOpen()).toBe(false)
  })

  it('moves focus into the dialog on open', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const { container } = render(<LocationPrompt />)
    const panel = container.querySelector('.panel')
    expect(panel).not.toBeNull()
    expect(panel!.contains(document.activeElement)).toBe(true)
    outside.remove()
  })
})
