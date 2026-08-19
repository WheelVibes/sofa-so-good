// @vitest-environment happy-dom
/**
 * UIUX-25: the ShareModal copy buttons confirm inline — icon/label morph to a
 * checked "Copied!" for ~1.6s, then revert. Feedback lives in the control the
 * user pressed (complementing the toast).
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetModalGuardForTests } from '../controls/modalGuard'
import { useStore } from '../state/store'
import { ShareModal } from './ShareModal'

beforeEach(() => {
  useStore.getState().__resetForTest()
  resetModalGuardForTests()
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn() } })
  useStore.getState().setShareOpen(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetModalGuardForTests()
})

describe('ShareModal copy morph (UIUX-25)', () => {
  it('morphs to Copied! on copy and reverts after the flash window', async () => {
    vi.useFakeTimers()
    render(<ShareModal />)
    fireEvent.click(screen.getByText('Copy 3D link'))
    expect(screen.getByText('Copied!')).toBeTruthy()
    expect(screen.queryByText('Copy 3D link')).toBeNull()
    // The sibling plan-link button is unaffected.
    expect(screen.getByText('Copy plan link')).toBeTruthy()
    await act(() => {
      vi.advanceTimersByTime(1700)
    })
    expect(screen.queryByText('Copied!')).toBeNull()
    expect(screen.getByText('Copy 3D link')).toBeTruthy()
  })
})
