import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/** Place a bed-single (parametric, has colour params) at a position. */
function addBed(beddingColor: string, pos: [number, number]): string {
  return useStore.getState().addItem({
    defId: 'bed-single',
    position: pos,
    rotation: 0,
    props: { beddingColor },
  })
}

describe('styleClipboardSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('copies an item appearance and pastes it onto another (look only, not position)', () => {
    const a = addBed('#111111', [1, 1])
    const b = addBed('#999999', [3, 1])
    expect(useStore.getState().copyAppearance(a)).toBe(true)
    const n = useStore.getState().pasteAppearanceTo([b])
    expect(n).toBe(1)
    const items = useStore.getState().items
    const bItem = items.find((i) => i.id === b)!
    expect(bItem.props.beddingColor).toBe('#111111')
    expect(bItem.position).toEqual([3, 1]) // position untouched
  })

  it('returns 0 when the paste would change nothing', () => {
    const a = addBed('#111111', [1, 1])
    const b = addBed('#111111', [3, 1])
    useStore.getState().copyAppearance(a)
    expect(useStore.getState().pasteAppearanceTo([b])).toBe(0)
  })

  it('skips locked targets', () => {
    const a = addBed('#111111', [1, 1])
    const b = addBed('#999999', [3, 1])
    useStore.getState().toggleLock(b)
    useStore.getState().copyAppearance(a)
    expect(useStore.getState().pasteAppearanceTo([b])).toBe(0)
  })

  it('recolours every other item in the same category', () => {
    const a = addBed('#222222', [1, 1])
    const b = addBed('#999999', [3, 1])
    const c = addBed('#aaaaaa', [5, 1])
    const n = useStore.getState().applyAppearanceToCategory(a)
    expect(n).toBe(2)
    const items = useStore.getState().items
    expect(items.find((i) => i.id === b)!.props.beddingColor).toBe('#222222')
    expect(items.find((i) => i.id === c)!.props.beddingColor).toBe('#222222')
  })

  describe('recolorItems (bulk "Tint all")', () => {
    it("targets a parametric def's color field(s), not props.tint", () => {
      const a = addBed('#111111', [1, 1])
      const n = useStore.getState().recolorItems([a], '#ff8800')
      expect(n).toBe(1)
      const item = useStore.getState().items.find((i) => i.id === a)!
      expect(item.props.beddingColor).toBe('#ff8800')
      expect(item.props.tint).toBeUndefined()
    })

    it('skips locked items', () => {
      const a = addBed('#111111', [1, 1])
      useStore.getState().toggleLock(a)
      const n = useStore.getState().recolorItems([a], '#ff8800')
      expect(n).toBe(0)
      expect(useStore.getState().items.find((i) => i.id === a)!.props.beddingColor).toBe('#111111')
    })

    it('null hex clears back to the schema default, not blank', () => {
      const a = addBed('#111111', [1, 1])
      useStore.getState().recolorItems([a], '#ff8800')
      useStore.getState().recolorItems([a], null)
      const item = useStore.getState().items.find((i) => i.id === a)!
      // bed-single's beddingColor schema default (not '#111111', not '#ff8800').
      expect(item.props.beddingColor).not.toBe('#ff8800')
      expect(typeof item.props.beddingColor).toBe('string')
    })

    it('is a no-op (returns 0) when nothing actually changes', () => {
      const a = addBed('#ff8800', [1, 1])
      useStore.getState().recolorItems([a], '#ff8800') // sets every color field to it
      expect(useStore.getState().recolorItems([a], '#ff8800')).toBe(0)
    })

    it('batches multiple items into ONE undo step', () => {
      const a = addBed('#111111', [1, 1])
      const b = addBed('#222222', [3, 1])
      const beforePast = useStore.getState().past.length
      useStore.getState().recolorItems([a, b], '#333333')
      expect(useStore.getState().past.length).toBe(beforePast + 1)
      useStore.getState().undo()
      const items = useStore.getState().items
      expect(items.find((i) => i.id === a)!.props.beddingColor).toBe('#111111')
      expect(items.find((i) => i.id === b)!.props.beddingColor).toBe('#222222')
    })
  })
})
