// @vitest-environment happy-dom
/**
 * PLAN-FURNISH regression: a placement made in the 2D plan editor resolves to
 * a `pendingEdit` exactly like a 3D room-editor placement, but `roomEditor.
 * active` is (and stays) false the whole time it's open — so the bar's
 * "abandon on leaving the editor" effect must key off BOTH `roomEditor.active`
 * and `floorPlanEditing`, not just the former, or a plan placement's confirm
 * bar would auto-confirm itself the instant it appears (found via the
 * `plan-furnish-simple` visual-verification scenario).
 */
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { EditConfirmBar } from './EditConfirmBar'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useStore.setState({
    pendingEdit: null,
    roomEditor: { active: false, roomId: null },
    floorPlanEditing: false,
  })
})

function seedPlanPlacement() {
  useStore.setState({
    roomEditor: { active: false, roomId: null },
    floorPlanEditing: true,
    pendingEdit: { kind: 'placement', ids: ['sofa-1'], originals: [], priorItems: [] },
  })
}

describe('EditConfirmBar with a plan-editor-origin pendingEdit', () => {
  it('stays pending (shows the bar) while the plan editor is open, even though roomEditor is inactive', () => {
    seedPlanPlacement()
    const { container } = render(<EditConfirmBar />)
    vi.advanceTimersByTime(500)
    expect(useStore.getState().pendingEdit).not.toBeNull()
    expect(container.querySelector('.edit-confirm')).not.toBeNull()
    expect(container.querySelector('.edit-confirm-label')?.textContent).toBe('Place item?')
  })

  it('auto-confirms once the plan editor ALSO closes with a pending edit outstanding', () => {
    seedPlanPlacement()
    render(<EditConfirmBar />)
    expect(useStore.getState().pendingEdit).not.toBeNull()
    act(() => {
      useStore.setState({ floorPlanEditing: false })
    })
    expect(useStore.getState().pendingEdit).toBeNull()
  })
})
