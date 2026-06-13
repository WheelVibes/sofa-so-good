import { describe, expect, it } from 'vitest'
import {
  clampWalkEyeHeight,
  clampWalkFov,
  WALK_EYE_DEFAULT,
  WALK_EYE_MAX,
  WALK_EYE_MIN,
  WALK_FOV_DEFAULT,
  WALK_FOV_MAX,
  WALK_FOV_MIN,
} from './walkCameraSettings'

describe('clampWalkFov', () => {
  it('passes through in-range values', () => {
    expect(clampWalkFov(70)).toBe(70)
    expect(clampWalkFov(WALK_FOV_MIN)).toBe(WALK_FOV_MIN)
    expect(clampWalkFov(WALK_FOV_MAX)).toBe(WALK_FOV_MAX)
  })
  it('clamps out-of-range values to the bounds', () => {
    expect(clampWalkFov(0)).toBe(WALK_FOV_MIN)
    expect(clampWalkFov(-30)).toBe(WALK_FOV_MIN)
    expect(clampWalkFov(180)).toBe(WALK_FOV_MAX)
  })
  it('falls back to the default for non-finite input', () => {
    expect(clampWalkFov(Number.NaN)).toBe(WALK_FOV_DEFAULT)
    expect(clampWalkFov(Number.POSITIVE_INFINITY)).toBe(WALK_FOV_DEFAULT)
  })
})

describe('clampWalkEyeHeight', () => {
  it('passes through in-range values', () => {
    expect(clampWalkEyeHeight(1.6)).toBe(1.6)
    expect(clampWalkEyeHeight(WALK_EYE_MIN)).toBe(WALK_EYE_MIN)
    expect(clampWalkEyeHeight(WALK_EYE_MAX)).toBe(WALK_EYE_MAX)
  })
  it('clamps out-of-range values to the bounds', () => {
    expect(clampWalkEyeHeight(0)).toBe(WALK_EYE_MIN)
    expect(clampWalkEyeHeight(0.5)).toBe(WALK_EYE_MIN)
    expect(clampWalkEyeHeight(3)).toBe(WALK_EYE_MAX)
  })
  it('falls back to the default for non-finite input', () => {
    expect(clampWalkEyeHeight(Number.NaN)).toBe(WALK_EYE_DEFAULT)
    expect(clampWalkEyeHeight(Number.NEGATIVE_INFINITY)).toBe(WALK_EYE_DEFAULT)
  })
})

describe('defaults are in range', () => {
  it('FOV + eye-height defaults sit within their clamp windows', () => {
    expect(WALK_FOV_DEFAULT).toBeGreaterThanOrEqual(WALK_FOV_MIN)
    expect(WALK_FOV_DEFAULT).toBeLessThanOrEqual(WALK_FOV_MAX)
    expect(WALK_EYE_DEFAULT).toBeGreaterThanOrEqual(WALK_EYE_MIN)
    expect(WALK_EYE_DEFAULT).toBeLessThanOrEqual(WALK_EYE_MAX)
  })
})
