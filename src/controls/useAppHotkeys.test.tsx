// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import { getRoomEditorShell } from '../scene/roomEditorShell'
import { useStore } from '../state/store'
import { KEYBINDINGS, ROTATE_STEP } from './keybindings'
import { registerOpenModal, resetModalGuardForTests } from './modalGuard'
import { useAppHotkeys, useEditorHotkeys, useGlobalHotkeys } from './useAppHotkeys'

/** Dispatch a window keydown like a real key press (target = body). */
function press(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

/** Put the store inside the per-room editor (the only editing surface). */
function enterEditor(roomId = 'livingDining') {
  useStore.setState({ roomEditor: { active: true, roomId }, cameraMode: 'orbit' })
}

/** Add a catalog item at the edited room's centre (guaranteed collision-free
 *  in the empty default plan) and select it. Returns its id. */
function addSelectedChair(): string {
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

beforeEach(() => {
  useStore.getState().__resetForTest()
  resetModalGuardForTests()
  setResolvedFlags(resolveFlags(true))
})
afterEach(() => {
  setResolvedFlags(resolveFlags(true))
})

describe('useGlobalHotkeys (raw window layer)', () => {
  it('⌘K/Ctrl-K toggles the command palette, even from a text input', () => {
    const hook = renderHook(() => useGlobalHotkeys())
    press({ key: 'k', ctrlKey: true })
    expect(useStore.getState().cmdkOpen).toBe(true)
    // ⌘K deliberately bypasses the isEditableTarget guard (palette from anywhere).
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))
    })
    expect(useStore.getState().cmdkOpen).toBe(false)
    input.remove()
    hook.unmount()
  })

  it('is suppressed while a modal dialog is open (useModalGuard registry), resumes after close', () => {
    const hook = renderHook(() => useGlobalHotkeys())
    const release = registerOpenModal()
    press({ key: 'k', ctrlKey: true })
    press({ code: KEYBINDINGS.undo, ctrlKey: true })
    expect(useStore.getState().cmdkOpen).toBe(false)
    release()
    press({ key: 'k', ctrlKey: true })
    expect(useStore.getState().cmdkOpen).toBe(true)
    hook.unmount()
  })

  it('Ctrl+Z undoes the last edit; Ctrl+Shift+Z redoes it', () => {
    const hook = renderHook(() => useGlobalHotkeys())
    enterEditor()
    addSelectedChair() // addItem pushes one history step
    expect(useStore.getState().items).toHaveLength(1)
    press({ code: KEYBINDINGS.undo, ctrlKey: true })
    expect(useStore.getState().items).toHaveLength(0)
    press({ code: KEYBINDINGS.undo, ctrlKey: true, shiftKey: true })
    expect(useStore.getState().items).toHaveLength(1)
    hook.unmount()
  })
})

describe('useEditorHotkeys (editor-scoped dispatch via useKeyboard)', () => {
  it('Delete removes the selected items but skips locked (pinned) ones', () => {
    const hook = renderHook(() => useEditorHotkeys())
    enterEditor()
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [1, 1], rotation: 0, props: {} })
    const b = s.addItem({ defId: 'dining-chair', position: [2, 1], rotation: 0, props: {} })
    useStore.setState((st) => ({
      items: st.items.map((i) => (i.id === b ? { ...i, locked: true } : i)),
    }))
    useStore.getState().setSelectedItemIds([a, b])
    press({ code: KEYBINDINGS.deleteSelected })
    const ids = useStore.getState().items.map((i) => i.id)
    expect(ids).not.toContain(a)
    expect(ids).toContain(b)
    hook.unmount()
  })

  it('Delete is a no-op outside the per-room editor (view-only surfaces)', () => {
    const hook = renderHook(() => useEditorHotkeys())
    enterEditor()
    const a = addSelectedChair()
    // Leave the editor (overview is view-only) — selection preserved for the check.
    useStore.setState({ roomEditor: { active: false, roomId: null } })
    press({ code: KEYBINDINGS.deleteSelected })
    expect(useStore.getState().items.map((i) => i.id)).toContain(a)
    hook.unmount()
  })

  it('R rotates the selected item by 90° in ONE undo step', () => {
    const hook = renderHook(() => useEditorHotkeys())
    enterEditor()
    const id = addSelectedChair()
    const pastBefore = useStore.getState().past.length
    press({ code: KEYBINDINGS.rotate })
    const item = useStore.getState().items.find((i) => i.id === id)
    expect(item?.rotation).toBeCloseTo(ROTATE_STEP, 10)
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    hook.unmount()
  })

  it('editor keys are suppressed while a modal dialog is open', () => {
    const hook = renderHook(() => useEditorHotkeys())
    enterEditor()
    const id = addSelectedChair()
    const release = registerOpenModal()
    press({ code: KEYBINDINGS.rotate })
    expect(useStore.getState().items.find((i) => i.id === id)?.rotation).toBe(0)
    release()
    hook.unmount()
  })
})

describe('useAppHotkeys (composition)', () => {
  it('mounts both layers: ⌘K (global) and R-rotate (editor) work from one hook', () => {
    const hook = renderHook(() => useAppHotkeys())
    enterEditor()
    const id = addSelectedChair()
    press({ code: KEYBINDINGS.rotate })
    expect(useStore.getState().items.find((i) => i.id === id)?.rotation).toBeCloseTo(
      ROTATE_STEP,
      10,
    )
    press({ key: 'k', metaKey: true })
    expect(useStore.getState().cmdkOpen).toBe(true)
    hook.unmount()
  })
})
