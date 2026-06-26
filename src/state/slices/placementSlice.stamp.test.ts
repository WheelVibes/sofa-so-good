import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/**
 * Sticky "stamp" placement reducer logic (PARITY-STAMP-PLACE). The armed def is
 * always `activeDefId`; `stampMode` only decides whether a commit re-arms (sticky)
 * or disarms (classic single-add). The placement controller reads these on each
 * click; here we exercise the slice transitions directly.
 */
describe('placementSlice — stamp mode', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('starts disarmed with stamp mode off', () => {
    expect(useStore.getState().activeDefId).toBeNull()
    expect(useStore.getState().stampMode).toBe(false)
  })

  it('startStamp arms the def AND turns on stamp mode', () => {
    useStore.getState().startStamp('sofa-3seat')
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    expect(useStore.getState().stampMode).toBe(true)
    expect(useStore.getState().ghostRotation).toBe(0)
  })

  it('startStamp on the already-armed stamp toggles it off (cancel)', () => {
    useStore.getState().startStamp('sofa-3seat')
    useStore.getState().startStamp('sofa-3seat')
    expect(useStore.getState().activeDefId).toBeNull()
    expect(useStore.getState().stampMode).toBe(false)
  })

  it('startStamp on a different def switches the armed def, staying in stamp mode', () => {
    useStore.getState().startStamp('sofa-3seat')
    useStore.getState().startStamp('dining-chair')
    expect(useStore.getState().activeDefId).toBe('dining-chair')
    expect(useStore.getState().stampMode).toBe(true)
  })

  it('a plain single-add arm (setActiveDefId) clears stamp mode', () => {
    useStore.getState().startStamp('sofa-3seat')
    expect(useStore.getState().stampMode).toBe(true)
    useStore.getState().setActiveDefId('dining-chair')
    expect(useStore.getState().activeDefId).toBe('dining-chair')
    expect(useStore.getState().stampMode).toBe(false)
  })

  it('setStampMode toggles stamp mode without changing the armed def', () => {
    useStore.getState().setActiveDefId('sofa-3seat')
    useStore.getState().setStampMode(true)
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    expect(useStore.getState().stampMode).toBe(true)
    useStore.getState().setStampMode(false)
    expect(useStore.getState().stampMode).toBe(false)
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
  })

  it('cancelPlacement (Esc / Done) disarms and clears stamp mode + ghost', () => {
    useStore.getState().startStamp('sofa-3seat')
    useStore.getState().setGhostWorld([1, 2], true)
    useStore.getState().rotateGhost(0.5)
    useStore.getState().cancelPlacement()
    const s = useStore.getState()
    expect(s.activeDefId).toBeNull()
    expect(s.stampMode).toBe(false)
    expect(s.ghostWorld).toBeNull()
    expect(s.ghostValid).toBe(false)
    expect(s.ghostRotation).toBe(0)
    expect(s.cursor).toBeNull()
  })

  it('each stamped placement is its own undo step (addItem pushes history per commit)', () => {
    // Simulate three stamp commits of the same def at distinct positions; the
    // controller keeps the mode armed between them (we leave activeDefId set).
    useStore.getState().startStamp('sofa-3seat')
    const before = useStore.getState().items.length
    const id1 = useStore
      .getState()
      .addItem({ defId: 'sofa-3seat', position: [0, 0], rotation: 0, props: {} })
    const id2 = useStore
      .getState()
      .addItem({ defId: 'sofa-3seat', position: [2, 0], rotation: 0, props: {} })
    const id3 = useStore
      .getState()
      .addItem({ defId: 'sofa-3seat', position: [4, 0], rotation: 0, props: {} })
    expect(useStore.getState().items.length).toBe(before + 3)
    // Distinct ids + positions for the same def.
    expect(new Set([id1, id2, id3]).size).toBe(3)
    // One undo reverts exactly one stamp (not the whole batch).
    useStore.getState().undo()
    expect(useStore.getState().items.length).toBe(before + 2)
    useStore.getState().undo()
    expect(useStore.getState().items.length).toBe(before + 1)
    // Stamp mode is unaffected by undo (it's transient, not in history).
    expect(useStore.getState().activeDefId).toBe('sofa-3seat')
    expect(useStore.getState().stampMode).toBe(true)
  })
})
