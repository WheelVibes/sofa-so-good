/**
 * COLOR-GRADE — scene-level warmth (white balance) + saturation dials: pure
 * curve/clamp behaviour, and the byte-identical-neutral guarantees the default
 * look depends on (warmth 0 → (1,1,1) light tint; saturation 1 → the post
 * stack's long-standing +0.06 HueSaturation baseline).
 */
import { describe, expect, it } from 'vitest'
import {
  BASE_POST_SATURATION,
  clampSceneSaturation,
  clampSceneWarmth,
  DEFAULT_SCENE_SATURATION,
  DEFAULT_SCENE_WARMTH,
  hueSatSaturation,
  warmthTintRGB,
} from './look'

describe('warmthTintRGB', () => {
  it('is exactly neutral at the default bias (no default-look regression)', () => {
    expect(warmthTintRGB(DEFAULT_SCENE_WARMTH)).toEqual([1, 1, 1])
  })

  it('+bias raises red and lowers blue; -bias mirrors (cooler)', () => {
    const warm = warmthTintRGB(1)
    expect(warm[0]).toBeGreaterThan(1)
    expect(warm[1]).toBe(1)
    expect(warm[2]).toBeLessThan(1)
    const cool = warmthTintRGB(-1)
    expect(cool[0]).toBeLessThan(1)
    expect(cool[2]).toBeGreaterThan(1)
  })

  it('clamps out-of-range and non-finite biases', () => {
    expect(warmthTintRGB(99)).toEqual(warmthTintRGB(1))
    expect(warmthTintRGB(Number.NaN)).toEqual([1, 1, 1])
    expect(clampSceneWarmth(-99)).toBe(-1)
  })
})

describe('hueSatSaturation', () => {
  it('reproduces the shipped +0.06 baseline exactly at the default multiplier', () => {
    expect(hueSatSaturation(DEFAULT_SCENE_SATURATION)).toBe(BASE_POST_SATURATION)
  })

  it('0 desaturates (negative pass value), 2 saturates, both within the pass range', () => {
    expect(hueSatSaturation(0)).toBeLessThan(0)
    // POST-SAT-NEUTRAL: the baseline is deliberately neutral. The tone curve
    // already over-saturates warm mid-dark surfaces (a 0.508-saturation albedo
    // renders at 0.833), so a positive baseline on top compounds it.
    expect(BASE_POST_SATURATION).toBe(0)
    expect(hueSatSaturation(0)).toBeGreaterThanOrEqual(-1)
    expect(hueSatSaturation(2)).toBeGreaterThan(BASE_POST_SATURATION)
    expect(hueSatSaturation(2)).toBeLessThanOrEqual(1)
  })

  it('clamps non-finite input to the neutral default', () => {
    expect(clampSceneSaturation(Number.NaN)).toBe(DEFAULT_SCENE_SATURATION)
  })
})
