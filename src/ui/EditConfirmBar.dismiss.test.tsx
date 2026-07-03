// @vitest-environment happy-dom
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingEdit } from '../state/slices/placementSlice'
import { useStore } from '../state/store'
import { EditConfirmBar } from './EditConfirmBar'

/** Seed a pending edit inside an active room editor (the bar auto-confirms and
 *  clears itself when the editor is not active — see EditConfirmBar). */
function seedPending(kind: PendingEdit['kind'] = 'transform') {
  useStore.setState({
    roomEditor: { active: true, roomId: 'living' },
    pendingEdit: {
      kind,
      ids: ['a'],
      originals: [{ id: 'a', position: [0, 0], rotation: 0 }],
    },
  })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useStore.setState({ pendingEdit: null, roomEditor: { active: false, roomId: null } })
})

describe('EditConfirmBar dismiss animation', () => {
  it('adds a transient .leaving class on confirm before resolving the store action', () => {
    seedPending()
    const { container } = render(<EditConfirmBar />)
    const confirm = container.querySelector('.edit-confirm-btn.confirm') as HTMLButtonElement
    fireEvent.click(confirm)
    // Class is present synchronously; the store action has NOT run yet.
    expect(container.querySelector('.edit-confirm.leaving')).not.toBeNull()
    expect(useStore.getState().pendingEdit).not.toBeNull()
    // After the transient delay the store action commits (bar unmounts).
    vi.advanceTimersByTime(200)
    expect(useStore.getState().pendingEdit).toBeNull()
  })

  it('adds a transient .rejecting class on cancel before resolving the store action', () => {
    seedPending()
    const { container } = render(<EditConfirmBar />)
    const cancel = container.querySelector('.edit-confirm-btn.cancel') as HTMLButtonElement
    fireEvent.click(cancel)
    expect(container.querySelector('.edit-confirm.rejecting')).not.toBeNull()
    expect(useStore.getState().pendingEdit).not.toBeNull()
    vi.advanceTimersByTime(200)
    expect(useStore.getState().pendingEdit).toBeNull()
  })

  it('routes keyboard Enter through the same wrapped leave path', () => {
    seedPending()
    const { container } = render(<EditConfirmBar />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(container.querySelector('.edit-confirm.leaving')).not.toBeNull()
    vi.advanceTimersByTime(200)
    expect(useStore.getState().pendingEdit).toBeNull()
  })

  it('resets the exit state when a fresh pending arrives', () => {
    seedPending()
    const { container, rerender } = render(<EditConfirmBar />)
    fireEvent.click(container.querySelector('.edit-confirm-btn.confirm') as HTMLButtonElement)
    vi.advanceTimersByTime(200)
    // A brand-new pending edit should render the bar without a stale exit class.
    seedPending('placement')
    rerender(<EditConfirmBar />)
    expect(container.querySelector('.edit-confirm.leaving')).toBeNull()
    expect(container.querySelector('.edit-confirm.rejecting')).toBeNull()
    expect(container.querySelector('.edit-confirm')).not.toBeNull()
  })
})
