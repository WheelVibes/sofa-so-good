import { beforeEach, describe, expect, it } from 'vitest'
import { FINISH_DND_MIME } from '../materials/finishDrop'
import { applyFinishDropAction, isFinishDrag, readFinishDragPayload } from './finishDropApply'
import { useStore } from './store'

const s = () => useStore.getState()

function fakeDataTransfer(data: Record<string, string>): DataTransfer {
  return {
    types: Object.keys(data),
    getData: (type: string) => data[type] ?? '',
  } as unknown as DataTransfer
}

describe('readFinishDragPayload / isFinishDrag', () => {
  it('reads our payload and flags our MIME during dragover', () => {
    const dt = fakeDataTransfer({ [FINISH_DND_MIME]: '{"finishId":"floor-parquet-oak"}' })
    expect(isFinishDrag(dt)).toBe(true)
    expect(readFinishDragPayload(dt)).toEqual({ finishId: 'floor-parquet-oak' })
  })

  it('no-ops safely on foreign drags (files, plain text) and null', () => {
    expect(isFinishDrag(null)).toBe(false)
    expect(readFinishDragPayload(null)).toBeNull()
    const files = fakeDataTransfer({ Files: '' })
    expect(isFinishDrag(files)).toBe(false)
    expect(readFinishDragPayload(files)).toBeNull()
    const text = fakeDataTransfer({ 'text/plain': 'hello' })
    expect(isFinishDrag(text)).toBe(false)
    expect(readFinishDragPayload(text)).toBeNull()
  })
})

describe('applyFinishDropAction', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('applies a floor drop in exactly one undo step and feeds recents', () => {
    const before = s().past.length
    const ok = applyFinishDropAction({
      type: 'floor',
      roomId: 'livingDining',
      finishId: 'floor-parquet-oak',
    })
    expect(ok).toBe(true)
    expect(s().finishes.floor.livingDining).toBe('floor-parquet-oak')
    expect(s().past.length).toBe(before + 1)
    expect(s().recentFinishes[0]).toBe('floor-parquet-oak')
    s().undo()
    expect(s().past.length).toBe(before)
  })

  it('applies a wall drop, routing a custom hex colour to recent colours', () => {
    const before = s().past.length
    expect(applyFinishDropAction({ type: 'wall', roomId: 'bedroom2', finishId: '#aabbcc' })).toBe(
      true,
    )
    expect(s().finishes.walls.bedroom2).toBe('#aabbcc')
    expect(s().past.length).toBe(before + 1)
    expect(s().recentColors[0]).toBe('#aabbcc')
  })

  it('applies an item drop as one undo step via the item finish prop', () => {
    const id = s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    const before = s().past.length
    expect(applyFinishDropAction({ type: 'item', itemId: id, finishId: 'mat:Wood01' })).toBe(true)
    expect(s().items.find((it) => it.id === id)?.props['finish']).toBe('mat:Wood01')
    expect(s().past.length).toBe(before + 1)
  })

  it('normalises a raw catalog id to the mat:<id> furniture-finish convention', () => {
    const id = s().addItem({ defId: 'bed-double', position: [1, 1], rotation: 0, props: {} })
    applyFinishDropAction({ type: 'item', itemId: id, finishId: 'floor-parquet-oak' })
    expect(s().items.find((it) => it.id === id)?.props['finish']).toBe('mat:floor-parquet-oak')
  })

  it('no-ops (no history, returns false) on null actions and vanished items', () => {
    const before = s().past.length
    expect(applyFinishDropAction(null)).toBe(false)
    expect(applyFinishDropAction(undefined)).toBe(false)
    expect(applyFinishDropAction({ type: 'item', itemId: 'ghost', finishId: 'oak' })).toBe(false)
    expect(s().past.length).toBe(before)
  })
})
