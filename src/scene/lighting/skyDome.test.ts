import { describe, expect, it } from 'vitest'
import { DOME_FAR_MARGIN, domeRadiusIsSafe, SCENE_CAMERA_FAR, SKY_DOME_RADIUS } from './skyDome'

describe('sky dome / camera far contract (SKY-DOME-FAR)', () => {
  it('keeps the shipped dome inside the shipped far plane', () => {
    expect(domeRadiusIsSafe(SKY_DOME_RADIUS, SCENE_CAMERA_FAR)).toBe(true)
  })

  // The regression itself: radius 400 against far 400. A world-anchored dome at
  // that radius put 436 of 825 vertices outside the frustum and rendered the orbit
  // background as a faceted polygon of sky in a field of page colour.
  it('rejects the pair that shipped the clipped sky', () => {
    expect(domeRadiusIsSafe(400, 400)).toBe(false)
  })

  it('rejects a dome sitting exactly on the far plane or beyond it', () => {
    expect(domeRadiusIsSafe(SCENE_CAMERA_FAR, SCENE_CAMERA_FAR)).toBe(false)
    expect(domeRadiusIsSafe(SCENE_CAMERA_FAR + 1, SCENE_CAMERA_FAR)).toBe(false)
  })

  it('accepts exactly at the margin and rejects just past it', () => {
    expect(domeRadiusIsSafe(SCENE_CAMERA_FAR * DOME_FAR_MARGIN, SCENE_CAMERA_FAR)).toBe(true)
    expect(domeRadiusIsSafe(SCENE_CAMERA_FAR * DOME_FAR_MARGIN + 0.01, SCENE_CAMERA_FAR)).toBe(
      false,
    )
  })

  it('rejects degenerate and non-finite inputs', () => {
    for (const [r, f] of [
      [0, 400],
      [-1, 400],
      [100, 0],
      [100, -400],
      [Number.NaN, 400],
      [100, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(domeRadiusIsSafe(r, f)).toBe(false)
    }
  })

  // The dome tracks the camera, so its radius must clear the whole scene from any
  // orbit pose — the largest shipped plan (HDB Jumbo) is 14.4 x 13.2 m.
  it('clears the largest shipped plan by a wide margin', () => {
    expect(SKY_DOME_RADIUS).toBeGreaterThan(100)
  })
})
