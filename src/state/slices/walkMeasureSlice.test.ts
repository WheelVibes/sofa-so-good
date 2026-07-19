import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

function s() {
  return useStore.getState()
}

describe('walkMeasureSlice — cycleWalkMeasurePoint (WALK-MEASURE)', () => {
  beforeEach(() => {
    s().__resetForTest()
  })

  it('starts with no points set', () => {
    expect(s().walkMeasureA).toBeNull()
    expect(s().walkMeasureB).toBeNull()
    expect(s().walkMeasureLive).toBeNull()
  })

  it('the first press sets A', () => {
    s().cycleWalkMeasurePoint([1, 0, 2])
    expect(s().walkMeasureA).toEqual([1, 0, 2])
    expect(s().walkMeasureB).toBeNull()
  })

  it('the second press sets B, leaving A untouched', () => {
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().cycleWalkMeasurePoint([3, 0, 4])
    expect(s().walkMeasureA).toEqual([1, 0, 2])
    expect(s().walkMeasureB).toEqual([3, 0, 4])
  })

  it('the third press clears both back to null (fresh start, not a re-arm)', () => {
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().cycleWalkMeasurePoint([3, 0, 4])
    s().cycleWalkMeasurePoint([5, 0, 6])
    expect(s().walkMeasureA).toBeNull()
    expect(s().walkMeasureB).toBeNull()
  })

  it('a null point (nothing aimed) is a no-op at every stage', () => {
    s().cycleWalkMeasurePoint(null)
    expect(s().walkMeasureA).toBeNull()
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().cycleWalkMeasurePoint(null)
    expect(s().walkMeasureA).toEqual([1, 0, 2])
    expect(s().walkMeasureB).toBeNull()
  })

  it('setting B clears any stale live-preview point', () => {
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().setWalkMeasureLive([9, 0, 9])
    s().cycleWalkMeasurePoint([3, 0, 4])
    expect(s().walkMeasureLive).toBeNull()
  })

  it('clearWalkMeasure resets from any stage', () => {
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().clearWalkMeasure()
    expect(s().walkMeasureA).toBeNull()
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().cycleWalkMeasurePoint([3, 0, 4])
    s().clearWalkMeasure()
    expect(s().walkMeasureA).toBeNull()
    expect(s().walkMeasureB).toBeNull()
  })

  it('setWalkMeasureLive keeps the same state reference for a null-to-null no-op (perf guard)', () => {
    const prev = s()
    s().setWalkMeasureLive(null)
    expect(s()).toBe(prev)
  })

  it('is not part of undo history (session-only view state)', () => {
    s().addItem({ defId: 'sofa-3seat', position: [0, 0], rotation: 0, props: {} })
    s().cycleWalkMeasurePoint([1, 0, 2])
    s().undo()
    // The item add undoes; the measure point (never pushed to history) survives.
    expect(s().items.length).toBe(0)
    expect(s().walkMeasureA).toEqual([1, 0, 2])
  })
})
