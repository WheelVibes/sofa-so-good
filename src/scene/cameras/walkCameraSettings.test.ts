import { describe, expect, it } from 'vitest'
import {
  clampWalkEyeHeight,
  clampWalkFov,
  horizontalFov,
  WALK_EYE_DEFAULT,
  WALK_EYE_MAX,
  WALK_EYE_MIN,
  WALK_FOV_DEFAULT,
  WALK_FOV_MAX,
  WALK_FOV_MIN,
  WALK_FOV_REF_ASPECT,
  walkVerticalFov,
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

describe('walkVerticalFov', () => {
  const DESKTOP = 1281 / 814 // the real desktop canvas aspect
  const PHONE = 390 / 700 // a phone in portrait

  it('leaves any viewport at/above the reference aspect on the slider value', () => {
    expect(walkVerticalFov(WALK_FOV_DEFAULT, DESKTOP)).toBe(WALK_FOV_DEFAULT)
    expect(walkVerticalFov(WALK_FOV_DEFAULT, 16 / 9)).toBe(WALK_FOV_DEFAULT)
    expect(walkVerticalFov(WALK_FOV_DEFAULT, WALK_FOV_REF_ASPECT)).toBe(WALK_FOV_DEFAULT)
    // A deliberately narrow pick is honoured too — the widening is aspect-driven,
    // not a fixed floor that would override the slider.
    expect(walkVerticalFov(WALK_FOV_MIN, DESKTOP)).toBe(WALK_FOV_MIN)
  })

  it('holds the horizontal view a narrower viewport would otherwise lose', () => {
    const v = walkVerticalFov(WALK_FOV_DEFAULT, 1)
    expect(v).toBeGreaterThan(WALK_FOV_DEFAULT)
    expect(horizontalFov(v, 1)).toBeCloseTo(horizontalFov(WALK_FOV_DEFAULT, WALK_FOV_REF_ASPECT), 4)
  })

  it('rescues a phone in portrait from tunnel vision, capped at the fov max', () => {
    const v = walkVerticalFov(WALK_FOV_DEFAULT, PHONE)
    expect(v).toBe(WALK_FOV_MAX) // the full horizontal hold would need >100°
    expect(horizontalFov(v, PHONE)).toBeGreaterThan(horizontalFov(WALK_FOV_DEFAULT, PHONE) + 20)
  })

  it('scales with the slider rather than snapping to one width', () => {
    const narrow = walkVerticalFov(WALK_FOV_MIN, 1)
    const wide = walkVerticalFov(WALK_FOV_DEFAULT, 1)
    expect(narrow).toBeLessThan(wide)
    expect(horizontalFov(narrow, 1)).toBeCloseTo(
      horizontalFov(WALK_FOV_MIN, WALK_FOV_REF_ASPECT),
      4,
    )
  })

  it('clamps the slider value and survives a degenerate aspect', () => {
    expect(walkVerticalFov(500, DESKTOP)).toBe(WALK_FOV_MAX)
    expect(walkVerticalFov(WALK_FOV_DEFAULT, 0)).toBe(WALK_FOV_DEFAULT)
    expect(walkVerticalFov(WALK_FOV_DEFAULT, Number.NaN)).toBe(WALK_FOV_DEFAULT)
  })
})

describe('horizontalFov', () => {
  it('matches the vertical angle at a 1:1 aspect and grows with width', () => {
    expect(horizontalFov(70, 1)).toBeCloseTo(70, 6)
    expect(horizontalFov(70, 16 / 9)).toBeGreaterThan(70)
    expect(horizontalFov(70, 0.5)).toBeLessThan(70)
  })
})
