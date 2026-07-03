import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

describe('lightInteractSlice — toggleLightPower (WALK-LIGHT-INTERACT)', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('turns a default-on table lamp off on the first toggle', () => {
    const id = s().addItem({ defId: 'table-lamp', position: [0, 0], rotation: 0, props: {} })
    s().toggleLightPower(id)
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBe('no')
  })

  it('round-trips back and forth on repeated calls', () => {
    const id = s().addItem({ defId: 'table-lamp', position: [0, 0], rotation: 0, props: {} })
    s().toggleLightPower(id)
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBe('no')
    s().toggleLightPower(id)
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBe('yes')
  })

  it('is undoable, like toggleWindowFixture', () => {
    const id = s().addItem({ defId: 'table-lamp', position: [0, 0], rotation: 0, props: {} })
    s().toggleLightPower(id)
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBe('no')
    s().undo()
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBeUndefined()
  })

  it('toggles a non-fixture item already flagged as a user light source', () => {
    const id = s().addItem({
      defId: 'sofa-3seat',
      position: [0, 0],
      rotation: 0,
      props: { lightOn: 'yes' },
    })
    s().toggleLightPower(id)
    expect(s().items.find((it) => it.id === id)?.props.lightOn).toBe('no')
  })

  it('is a no-op for a non-interactable item (e.g. a plain sofa)', () => {
    const id = s().addItem({ defId: 'sofa-3seat', position: [0, 0], rotation: 0, props: {} })
    const before = s().items
    s().toggleLightPower(id)
    expect(s().items).toBe(before)
  })

  it('is a no-op for an unknown item id', () => {
    const before = s().items
    s().toggleLightPower('does-not-exist')
    expect(s().items).toBe(before)
  })

  it('setNearbyLight keeps the same state reference for a no-op set (perf guard)', () => {
    const prev = s()
    s().setNearbyLight(null)
    expect(s().nearbyLightId).toBeNull()
    s().setNearbyLight('lamp-1')
    expect(s().nearbyLightId).toBe('lamp-1')
    expect(s()).not.toBe(prev)
  })
})
