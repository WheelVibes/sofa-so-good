import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

describe('windowFixtureSlice — toggleWindowFixture (WINDOW-FIXTURE-INTERACT)', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('flips a curtain from fully open to fully drawn on the first toggle', () => {
    const id = s().addItem({
      defId: 'curtains',
      position: [0, 0],
      rotation: 0,
      props: { drawAmount: 0 },
    })
    s().toggleWindowFixture(id)
    const item = s().items.find((it) => it.id === id)
    expect(item?.props.drawAmount).toBe(1)
  })

  it('toggles back and forth on repeated calls', () => {
    const id = s().addItem({
      defId: 'curtains',
      position: [0, 0],
      rotation: 0,
      props: { drawAmount: 1 },
    })
    s().toggleWindowFixture(id)
    expect(s().items.find((it) => it.id === id)?.props.drawAmount).toBe(0)
    s().toggleWindowFixture(id)
    expect(s().items.find((it) => it.id === id)?.props.drawAmount).toBe(1)
  })

  it('flips a roller blind between raised and lowered', () => {
    const id = s().addItem({
      defId: 'roller-blind',
      position: [0, 0],
      rotation: 0,
      props: { lower: 1 },
    })
    s().toggleWindowFixture(id)
    expect(s().items.find((it) => it.id === id)?.props.lower).toBe(0)
  })

  it('is undoable, like toggleDoor', () => {
    const id = s().addItem({
      defId: 'curtains',
      position: [0, 0],
      rotation: 0,
      props: { drawAmount: 0 },
    })
    s().toggleWindowFixture(id)
    expect(s().items.find((it) => it.id === id)?.props.drawAmount).toBe(1)
    s().undo()
    expect(s().items.find((it) => it.id === id)?.props.drawAmount).toBe(0)
  })

  it('is a no-op for a non-window-bound item (e.g. a sofa)', () => {
    const id = s().addItem({ defId: 'bed-double', position: [0, 0], rotation: 0, props: {} })
    const before = s().items
    s().toggleWindowFixture(id)
    expect(s().items).toBe(before)
  })

  it('is a no-op for an unknown item id', () => {
    const before = s().items
    s().toggleWindowFixture('does-not-exist')
    expect(s().items).toBe(before)
  })

  it('setNearbyFixture keeps the same state reference for a no-op set (perf guard)', () => {
    const prev = s()
    s().setNearbyFixture(null)
    expect(s().nearbyFixtureId).toBeNull()
    s().setNearbyFixture('curtain-1')
    expect(s().nearbyFixtureId).toBe('curtain-1')
    expect(s()).not.toBe(prev)
  })
})
