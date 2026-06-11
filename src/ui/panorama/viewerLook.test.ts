import { describe, expect, it } from 'vitest'
import {
  DRAG_SENSITIVITY,
  dragLook,
  FOV_MAX,
  FOV_MIN,
  INITIAL_LOOK,
  PITCH_LIMIT,
  zoomLook,
} from './viewerLook'

describe('panorama viewer look math', () => {
  it('starts level, facing forward, at the default fov', () => {
    expect(INITIAL_LOOK).toEqual({ yaw: 0, pitch: 0, fov: 75 })
  })

  it('a drag accumulates yaw and pitch at the drag sensitivity', () => {
    const s = dragLook(INITIAL_LOOK, 100, -40)
    expect(s.yaw).toBeCloseTo(100 * DRAG_SENSITIVITY)
    expect(s.pitch).toBeCloseTo(-40 * DRAG_SENSITIVITY)
    expect(s.fov).toBe(75) // drag never zooms
  })

  it('drags chain (state in, state out)', () => {
    const s = dragLook(dragLook(INITIAL_LOOK, 50, 0), 50, 0)
    expect(s.yaw).toBeCloseTo(100 * DRAG_SENSITIVITY)
  })

  it('clamps pitch short of both poles', () => {
    const up = dragLook(INITIAL_LOOK, 0, -1e6)
    const down = dragLook(INITIAL_LOOK, 0, 1e6)
    expect(up.pitch).toBe(-PITCH_LIMIT)
    expect(down.pitch).toBe(PITCH_LIMIT)
  })

  it('yaw is unclamped (free spin)', () => {
    expect(dragLook(INITIAL_LOOK, 1e6, 0).yaw).toBeGreaterThan(Math.PI * 2)
  })

  it('wheel zoom clamps fov to [FOV_MIN, FOV_MAX]', () => {
    expect(zoomLook(INITIAL_LOOK, -1e5).fov).toBe(FOV_MIN)
    expect(zoomLook(INITIAL_LOOK, 1e5).fov).toBe(FOV_MAX)
    expect(zoomLook(INITIAL_LOOK, 100).fov).toBeCloseTo(80)
    expect(zoomLook(INITIAL_LOOK, 100).yaw).toBe(0) // zoom never looks
  })
})
