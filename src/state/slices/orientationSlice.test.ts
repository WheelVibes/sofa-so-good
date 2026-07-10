import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

/** R3-TEST-2 — home compass rotation driving sun/sky orientation + the compass
 *  HUD. A bad wrap silently mis-rotates the sun for every daylight feature, so
 *  the normalize behaviour is pinned here. */
describe('orientationSlice — setOrientationDeg normalizes into [0, 360)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('defaults to 0', () => {
    expect(useStore.getState().orientationDeg).toBe(0)
  })

  it.each([
    [0, 0],
    [90, 90],
    [359.5, 359.5],
    [360, 0],
    [450, 90],
    [720, 0],
    [-90, 270],
    [-360, 0],
    [-450, 270],
  ])('setOrientationDeg(%d) → %d', (input, expected) => {
    useStore.getState().setOrientationDeg(input)
    expect(useStore.getState().orientationDeg).toBeCloseTo(expected, 10)
  })

  it('never stores a negative or >= 360 value across a sweep', () => {
    for (let deg = -1080; deg <= 1080; deg += 45) {
      useStore.getState().setOrientationDeg(deg)
      const v = useStore.getState().orientationDeg
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(360)
    }
  })
})
