import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('applyStyleToAll', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it("copies the source item's props to all others of the same defId", () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'dining-chair', position: [2, 0], rotation: 0, props: {} })
    s.addItem({ defId: 'bed-double', position: [5, 5], rotation: 0, props: { finish: 'wood' } })
    // Style the source.
    s.updateItemProps(a, { finish: 'mat:floor-wood-walnut' })

    const n = useStore.getState().applyStyleToAll(a)
    expect(n).toBe(2)
    const chairs = useStore.getState().items.filter((i) => i.defId === 'dining-chair')
    expect(chairs.every((c) => c.props.finish === 'mat:floor-wood-walnut')).toBe(true)
    // The bed (different defId) is untouched.
    const bed = useStore.getState().items.find((i) => i.defId === 'bed-double')
    expect(bed?.props.finish).toBe('wood')
  })

  it('skips locked targets and returns the count restyled', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    const b = s.addItem({ defId: 'dining-chair', position: [1, 0], rotation: 0, props: {} })
    s.toggleLock(b)
    s.updateItemProps(a, { finish: 'gloss' })
    const n = useStore.getState().applyStyleToAll(a)
    expect(n).toBe(0)
    expect(useStore.getState().items.find((i) => i.id === b)?.props.finish).toBeUndefined()
  })

  it('returns 0 when there are no other items of the type', () => {
    const s = useStore.getState()
    const a = s.addItem({ defId: 'dining-chair', position: [0, 0], rotation: 0, props: {} })
    expect(useStore.getState().applyStyleToAll(a)).toBe(0)
  })
})
