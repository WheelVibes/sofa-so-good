// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { useStore } from '../state/store'
import { NUDGE_SPEED } from './keybindings'
import { registerOpenModal, resetModalGuardForTests } from './modalGuard'
import { useNudge } from './useNudge'

/**
 * Manual rAF pump: the nudge hold-loop schedules itself via
 * requestAnimationFrame with real timestamps, so the test drives frames with
 * chosen `t` values to get a deterministic dt (metres moved = speed × dt).
 */
let rafCallbacks: Map<number, FrameRequestCallback>
let nextRafId: number
function frame(t: number) {
  const pending = [...rafCallbacks.values()]
  rafCallbacks.clear()
  act(() => {
    for (const cb of pending) cb(t)
  })
}

function keydown(code: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init }),
    )
  })
}
function keyup(code: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
  })
}

/** Enter the room editor and place+select a chair at the room centre
 *  (collision-free in the empty default plan). Returns its id. */
function setupSelectedChair(): string {
  useStore.setState({ roomEditor: { active: true, roomId: 'livingDining' }, cameraMode: 'orbit' })
  const s = useStore.getState()
  const shell = getRoomEditorShell(s.floorPlan, 'livingDining')
  if (!shell) throw new Error('livingDining shell missing from the default plan')
  const id = s.addItem({
    defId: 'dining-chair',
    position: [shell.shell.center[0], shell.shell.center[1]],
    rotation: 0,
    props: {},
  })
  useStore.getState().setSelectedItemIds([id])
  return id
}

const pos = (id: string) => {
  const item = useStore.getState().items.find((i) => i.id === id)
  if (!item) throw new Error(`item ${id} missing`)
  return item.position
}

beforeEach(() => {
  useStore.getState().__resetForTest()
  resetModalGuardForTests()
  rafCallbacks = new Map()
  nextRafId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafCallbacks.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks.delete(id)
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useNudge (press-and-hold arrow-key nudge)', () => {
  it('moves the selected item by speed × dt and coalesces the hold + re-tap into ONE undo step', () => {
    const hook = renderHook(() => useNudge())
    const id = setupSelectedChair()
    const [x0, z0] = pos(id)
    const pastBefore = useStore.getState().past.length

    // First keydown of the session snapshots once, under the 'nudge' key.
    keydown('ArrowUp')
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    expect(rafCallbacks.size).toBe(1)

    // Frame 1 seeds the clock (dt = 0, no move); frame 2 is a real 16 ms step.
    // Default cameraForwardXZ is (0, -1), so ArrowUp = "away" = world -Z.
    frame(1000)
    expect(pos(id)).toEqual([x0, z0])
    frame(1016)
    const [x1, z1] = pos(id)
    expect(x1).toBeCloseTo(x0, 10)
    expect(z1).toBeCloseTo(z0 - NUDGE_SPEED * 0.016, 10)

    // Release stops the loop (pending frame cancelled)…
    keyup('ArrowUp')
    expect(rafCallbacks.size).toBe(0)
    // …and a quick re-tap within the coalesce window does NOT open a new step.
    keydown('ArrowUp')
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    keyup('ArrowUp')

    // The whole session undoes back to the pre-nudge position in one step.
    act(() => useStore.getState().undo())
    expect(pos(id)).toEqual([x0, z0])
    hook.unmount()
  })

  it('is suppressed while a modal dialog is open (useModalGuard registry)', () => {
    const hook = renderHook(() => useNudge())
    setupSelectedChair()
    const pastBefore = useStore.getState().past.length
    const release = registerOpenModal()
    keydown('ArrowUp')
    expect(useStore.getState().past.length).toBe(pastBefore)
    expect(rafCallbacks.size).toBe(0)
    release()
    hook.unmount()
  })

  it('does nothing outside the per-room editor (view-only surfaces)', () => {
    const hook = renderHook(() => useNudge())
    const id = setupSelectedChair()
    const before = pos(id)
    useStore.setState({ roomEditor: { active: false, roomId: null } })
    const pastBefore = useStore.getState().past.length
    keydown('ArrowUp')
    expect(useStore.getState().past.length).toBe(pastBefore)
    expect(rafCallbacks.size).toBe(0)
    expect(pos(id)).toEqual(before)
    hook.unmount()
  })
})
