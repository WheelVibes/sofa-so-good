import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import type { FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import { registerOpenModal, resetModalGuardForTests } from './modalGuard'
import { usePlanEditorHotkey } from './planEditorHotkey'

/** Dispatch a window keydown like a real key press (target = body). */
function press(code: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }))
  })
}

const editing = () => useStore.getState().floorPlanEditing

describe('usePlanEditorHotkey (global P ⇄ 2D plan editor)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    resetModalGuardForTests()
    setResolvedFlags(resolveFlags(true))
  })
  afterEach(() => {
    setResolvedFlags(resolveFlags(true))
  })

  it('opens the editor from the closed (3D) state — the binding is always mounted', () => {
    // Regression P-OPENS-PLAN: FloorPlanEditor is lazy-mounted only while open,
    // so the open binding must NOT live inside it. Here nothing but the hook is
    // mounted (the editor component does not exist) and P still opens it.
    const hook = renderHook(() => usePlanEditorHotkey())
    expect(editing()).toBe(false)
    press('KeyP')
    expect(editing()).toBe(true)
    hook.unmount()
  })

  it('still closes the editor when open, framing the selected item', () => {
    const hook = renderHook(() => usePlanEditorHotkey())
    const item: FurnitureItem = {
      id: 'it-1',
      defId: 'whatever',
      position: [2, 3],
      rotation: 0,
      props: {},
    }
    useStore.setState({ floorPlanEditing: true, items: [item], selectedItemId: 'it-1' })
    const nonceBefore = useStore.getState().focusNonce
    press('KeyP')
    expect(editing()).toBe(false)
    // 2D→3D lands on the item that was being worked on.
    expect(useStore.getState().focusPoint).toEqual([2, 3])
    expect(useStore.getState().focusNonce).toBe(nonceBefore + 1)
    hook.unmount()
  })

  it('is suppressed while a modal dialog is open, and resumes after close', () => {
    const hook = renderHook(() => usePlanEditorHotkey())
    const release = registerOpenModal()
    press('KeyP')
    expect(editing()).toBe(false)
    release()
    press('KeyP')
    expect(editing()).toBe(true)
    hook.unmount()
  })

  it('ignores typing into an editable target', () => {
    const hook = renderHook(() => usePlanEditorHotkey())
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }))
    })
    expect(editing()).toBe(false)
    input.remove()
    hook.unmount()
  })

  it('ignores walk mode and modifier combos', () => {
    const hook = renderHook(() => usePlanEditorHotkey())
    useStore.setState({ cameraMode: 'firstPerson' })
    press('KeyP')
    expect(editing()).toBe(false)
    useStore.setState({ cameraMode: 'orbit' })
    press('KeyP', { ctrlKey: true })
    press('KeyP', { metaKey: true })
    press('KeyP', { altKey: true })
    expect(editing()).toBe(false)
    hook.unmount()
  })

  it('works in BOTH Simple and Pro mode (simple-tier flag), no-ops when the flag is off', () => {
    const hook = renderHook(() => usePlanEditorHotkey())
    // Simple mode (the app default): floorPlanEditor is simple-tier → on.
    setResolvedFlags(resolveFlags(true, {}, false, 'simple'))
    press('KeyP')
    expect(editing()).toBe(true)
    // Pro mode: still on.
    setResolvedFlags(resolveFlags(true, {}, false, 'pro'))
    press('KeyP')
    expect(editing()).toBe(false)
    // Flag forced off (override): the binding goes inert.
    setResolvedFlags(resolveFlags(true, { floorPlanEditor: false }, false, 'pro'))
    press('KeyP')
    expect(editing()).toBe(false)
    hook.unmount()
  })
})
