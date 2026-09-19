// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../../state/store'
import { ModeSwitchCrossfade } from './ModeSwitchCrossfade'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('ModeSwitchCrossfade', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('renders the unbranded veil (data-mode-crossfade) on a real switch, never the branded splash', () => {
    stubReducedMotion(false)
    render(<ModeSwitchCrossfade />)
    act(() => {
      useStore.getState().setCameraMode('firstPerson')
    })
    expect(document.body.querySelector('[data-mode-crossfade]')).not.toBeNull()
    expect(document.body.querySelector('[data-transition-overlay]')).toBeNull()
  })

  /**
   * Found live via CDP `Emulation.setEmulatedMedia` while re-verifying N3 (v0.35.7.2): with
   * reduced motion the hook never mounts the veil, so the `mounted` true->false edge that
   * normally clears `modeTransition.active` never fires — it stayed stuck `true` forever
   * after the FIRST switch of a reduced-motion session. Regression guard.
   */
  it('reduced motion: never mounts the veil, and modeTransition.active still clears (no stuck-true)', () => {
    stubReducedMotion(true)
    render(<ModeSwitchCrossfade />)
    act(() => {
      useStore.getState().setCameraMode('firstPerson')
    })
    expect(document.body.querySelector('[data-mode-crossfade]')).toBeNull()
    expect(useStore.getState().modeTransition.active).toBe(false)

    // A second switch must resolve cleanly too, not just the first.
    act(() => {
      useStore.getState().setCameraMode('orbit')
    })
    expect(document.body.querySelector('[data-mode-crossfade]')).toBeNull()
    expect(useStore.getState().modeTransition.active).toBe(false)
  })
})
