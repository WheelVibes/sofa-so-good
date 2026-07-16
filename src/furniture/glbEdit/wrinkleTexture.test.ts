// @vitest-environment happy-dom
/**
 * Asset Studio Stage 6e — procedural fabric wrinkle normal map.
 *
 * The pure height field is deterministic per seed (stable across renders +
 * save/reload) and differs across seeds; the baked-map cache is bounded (a
 * Wrinkles/Plump slider drag reuses a handful of tiles, never one-per-frame) and
 * disposes on evict; the intensity/plump → `normalScale` + effective-intensity
 * resolvers behave as documented. (happy-dom so `DataTexture` + the LRU's
 * rAF-deferred dispose have a DOM; the height math itself is DOM-free.)
 */
import { afterEach, describe, expect, it } from 'vitest'
import { addPart, createEmptySpec, duplicatePart, mirrorPart, updatePart } from './editSpec'
import {
  __clearWrinkleCacheForTest,
  __wrinkleCacheSizeForTest,
  buildWrinkleHeight,
  DEFAULT_WRINKLES,
  effectiveWrinkles,
  wrinkleIntensityBucket,
  wrinkleNormalScale,
  wrinkleNormalTexture,
  wrinkleTextureKey,
} from './wrinkleTexture'

afterEach(() => __clearWrinkleCacheForTest())

describe('wrinkles carry through duplicate + mirror', () => {
  it('duplicate/mirror copy the wrinkles intensity verbatim (scalar, symmetric)', () => {
    let spec = addPart(createEmptySpec(), 'box')
    const id = spec.parts[0].id
    spec = updatePart(spec, id, { plump: 0.6, wrinkles: 0.35 })
    expect(duplicatePart(spec, id).parts[1].wrinkles).toBe(0.35)
    expect(mirrorPart(spec, id).parts[1].wrinkles).toBe(0.35)
  })
})

describe('buildWrinkleHeight', () => {
  it('is deterministic for a given (seed, intensity)', () => {
    const a = buildWrinkleHeight(64, 12345, 0.6)
    const b = buildWrinkleHeight(64, 12345, 0.6)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('differs across seeds (each cushion gets its own wrinkles)', () => {
    const a = buildWrinkleHeight(64, 111, 0.6)
    const b = buildWrinkleHeight(64, 222, 0.6)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('produces finite values in [0,1] of the right length', () => {
    const h = buildWrinkleHeight(32, 7, 1)
    expect(h.length).toBe(32 * 32)
    for (const v of h) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('gathers stronger creases at the corners than the crowned centre', () => {
    // Compare the LOCAL relief variance near a corner vs the centre. The gather
    // mask concentrates the low-freq folds toward the pinned corners, so a corner
    // patch should have more height variation than the smooth middle.
    const S = 64
    const h = buildWrinkleHeight(S, 99, 1)
    const patchRange = (cx: number, cy: number): number => {
      let lo = 1
      let hi = 0
      for (let y = cy - 4; y <= cy + 4; y++)
        for (let x = cx - 4; x <= cx + 4; x++) {
          const v = h[y * S + x]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      return hi - lo
    }
    // Average the four corners so a single lucky-flat corner doesn't skew it.
    const corners =
      (patchRange(6, 6) + patchRange(S - 7, 6) + patchRange(6, S - 7) + patchRange(S - 7, S - 7)) /
      4
    const centre = patchRange(S / 2, S / 2)
    expect(corners).toBeGreaterThan(centre)
  })

  it('lower intensity yields a shallower (less varying) field than higher', () => {
    const S = 48
    const range = (h: Float32Array) => {
      let lo = 1
      let hi = 0
      for (const v of h) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      return hi - lo
    }
    expect(range(buildWrinkleHeight(S, 5, 0.2))).toBeLessThan(range(buildWrinkleHeight(S, 5, 1)))
  })
})

describe('wrinkleNormalScale', () => {
  it('follows plump depth × intensity within ~0.15…0.4', () => {
    expect(wrinkleNormalScale(0, 1)).toBeCloseTo(0.15, 5)
    expect(wrinkleNormalScale(1, 1)).toBeCloseTo(0.4, 5)
    expect(wrinkleNormalScale(1, 0.5)).toBeCloseTo(0.2, 5)
    expect(wrinkleNormalScale(0.5, 0)).toBe(0)
  })
})

describe('effectiveWrinkles', () => {
  it('defaults ON (subtle) for a plumped part with no explicit field', () => {
    expect(effectiveWrinkles(0.7, undefined)).toBe(DEFAULT_WRINKLES)
  })
  it('is OFF when the part is not plumped', () => {
    expect(effectiveWrinkles(0, undefined)).toBe(0)
    expect(effectiveWrinkles(undefined, 0.8)).toBe(0)
  })
  it('honours an explicit intensity — including an explicit 0 (disabled)', () => {
    expect(effectiveWrinkles(0.5, 0)).toBe(0)
    expect(effectiveWrinkles(0.5, 0.3)).toBe(0.3)
  })
})

describe('wrinkle texture cache', () => {
  it('reuses a cached tile for the same (seed, intensity bucket)', () => {
    const a = wrinkleNormalTexture('part-a', 0.6)
    const b = wrinkleNormalTexture('part-a', 0.6)
    expect(a).toBe(b)
    expect(__wrinkleCacheSizeForTest()).toBe(1)
  })

  it('a plump/wrinkle slider sweep stays bounded (buckets, not one-per-frame)', () => {
    // 250 slider frames of a single part id at varying intensities → the cache
    // holds only the ~11 distinct 0.1 buckets, never 250.
    for (let i = 0; i < 250; i++) wrinkleNormalTexture('part-x', (i % 100) / 100)
    const size = __wrinkleCacheSizeForTest()
    expect(size).toBeLessThanOrEqual(11)
    expect(size).toBeGreaterThan(1)
  })

  it('bounds distinct parts to the LRU max (48)', () => {
    for (let i = 0; i < 60; i++) wrinkleNormalTexture(`part-${i}`, 0.6)
    expect(__wrinkleCacheSizeForTest()).toBeLessThanOrEqual(48)
  }, 20000)

  it('bakes a linear, repeat-wrapping DataTexture', () => {
    const t = wrinkleNormalTexture('part-a', 0.6)
    expect(t.image.width).toBe(256)
    expect((t.image.data as Uint8Array).length).toBe(256 * 256 * 4)
    expect(t.wrapS).toBeDefined()
  })
})

describe('wrinkle cache keys', () => {
  it('buckets intensity to 0.1 steps', () => {
    expect(wrinkleIntensityBucket(0.63)).toBe(0.6)
    expect(wrinkleIntensityBucket(0.67)).toBe(0.7)
  })
  it('is stable + distinct per (seed, bucket)', () => {
    expect(wrinkleTextureKey(10, 0.6)).toBe(wrinkleTextureKey(10, 0.62))
    expect(wrinkleTextureKey(10, 0.6)).not.toBe(wrinkleTextureKey(11, 0.6))
    expect(wrinkleTextureKey(10, 0.6)).not.toBe(wrinkleTextureKey(10, 0.8))
  })
})
