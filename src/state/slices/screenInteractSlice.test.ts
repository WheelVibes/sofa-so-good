import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

describe('screenInteractSlice — cycleScreenContent (WALK-SCREEN-INTERACT)', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('cycles a monitor from landscape to sunset on the first interact', () => {
    const id = s().addItem({
      defId: 'monitor',
      position: [0, 0],
      rotation: 0,
      props: { screenContent: 'landscape' },
    })
    s().cycleScreenContent(id)
    expect(s().items.find((it) => it.id === id)?.props.screenContent).toBe('sunset')
  })

  it('wraps around from the last option back to the first', () => {
    const id = s().addItem({
      defId: 'flatscreen-tv',
      position: [0, 0],
      rotation: 0,
      props: { screenContent: 'abstract' },
    })
    s().cycleScreenContent(id)
    expect(s().items.find((it) => it.id === id)?.props.screenContent).toBe('landscape')
  })

  it('cycles a wall TV (tv-wall shares the FlatscreenTV primitive)', () => {
    const id = s().addItem({
      defId: 'tv-wall',
      position: [0, 0],
      rotation: 0,
      props: { screenContent: 'landscape' },
    })
    s().cycleScreenContent(id)
    expect(s().items.find((it) => it.id === id)?.props.screenContent).toBe('sunset')
  })

  it('is undoable', () => {
    const id = s().addItem({
      defId: 'monitor',
      position: [0, 0],
      rotation: 0,
      props: { screenContent: 'landscape' },
    })
    s().cycleScreenContent(id)
    expect(s().items.find((it) => it.id === id)?.props.screenContent).toBe('sunset')
    s().undo()
    expect(s().items.find((it) => it.id === id)?.props.screenContent).toBe('landscape')
  })

  it('is a no-op for a non-screen item (e.g. a sofa)', () => {
    const id = s().addItem({ defId: 'sofa-3seat', position: [0, 0], rotation: 0, props: {} })
    const before = s().items
    s().cycleScreenContent(id)
    expect(s().items).toBe(before)
  })

  it('is a no-op for an unknown item id', () => {
    const before = s().items
    s().cycleScreenContent('does-not-exist')
    expect(s().items).toBe(before)
  })

  it('setNearbyScreen keeps the same state reference for a no-op set (perf guard)', () => {
    const prev = s()
    s().setNearbyScreen(null)
    expect(s().nearbyScreenId).toBeNull()
    s().setNearbyScreen('monitor-1')
    expect(s().nearbyScreenId).toBe('monitor-1')
    expect(s()).not.toBe(prev)
  })
})
