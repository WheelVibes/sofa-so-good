import { describe, expect, it } from 'vitest'
import {
  isMagnified,
  MAX_TILE_M,
  MIN_TILE_M,
  maxScaleForMap,
  resolveTileSize,
  TARGET_TEXEL_DENSITY,
  texelDensity,
} from './tileSize'

describe('resolveTileSize', () => {
  it('prefers the scanned size the provider publishes', () => {
    // ambientCG Wood066 is a 0.4 m patch; the packer's family table guessed
    // 1.2 m, which stretched every texel over 3x the floor.
    expect(resolveTileSize({ scanMetres: 0.4, pixels: 1024, fallbackMetres: 1.2 })).toEqual({
      metres: 0.4,
      source: 'scan',
    })
  })

  it('derives from resolution when there is no scan size and no guess', () => {
    // A user upload: a 1K map at the target density covers 2 m, a 2K map 4 m —
    // twice the floor at the SAME sharpness, instead of both taking one guess.
    expect(resolveTileSize({ pixels: 1024 }).metres).toBeCloseTo(2, 6)
    expect(resolveTileSize({ pixels: 2048 }).metres).toBeCloseTo(4, 6)
    expect(resolveTileSize({ pixels: 1024 }).source).toBe('density')
  })

  it('lets a guess SHRINK a map but never stretch it', () => {
    // Smaller than the map can cover → kept as-is (more repeats, full detail).
    expect(resolveTileSize({ fallbackMetres: 0.6, pixels: 1024 })).toEqual({
      metres: 0.6,
      source: 'fallback',
    })
    // Bigger → capped at what 1024 px can cover sharply, and marked as such.
    expect(resolveTileSize({ fallbackMetres: 3, pixels: 1024 })).toEqual({
      metres: 2,
      source: 'density',
    })
  })

  it('lets a KNOWN scan size stand past the target density', () => {
    // Reality beats sharpness: a 2.45 m tile scan really is 2.45 m (418 px/m
    // from a 1K map — the density our procedural floors ship at), and shrinking
    // it to 2 m would render a floor whose tiles are the wrong size.
    expect(resolveTileSize({ scanMetres: 2.45, pixels: 1024 })).toEqual({
      metres: 2.45,
      source: 'scan',
    })
  })

  it('but not past the sharpness FLOOR — a 5.4 m scan on a 1K map is mush', () => {
    // 1024 / 256 = 4 m is as far as a 1K map is allowed to stretch.
    expect(resolveTileSize({ scanMetres: 5.4, pixels: 1024 })).toEqual({
      metres: 4,
      source: 'scan',
    })
    // A 4K download of the same scan keeps its true size.
    expect(resolveTileSize({ scanMetres: 5.4, pixels: 4096 }).metres).toBeCloseTo(5.4, 6)
  })

  it('uses the fallback only when nothing about the map is known', () => {
    expect(resolveTileSize({ fallbackMetres: 1.5 })).toEqual({ metres: 1.5, source: 'fallback' })
    // And degrades to the historical default rather than a NaN UV.
    expect(resolveTileSize({})).toEqual({ metres: 1, source: 'fallback' })
  })

  it('ignores junk values instead of propagating them into a UV', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(resolveTileSize({ scanMetres: bad as number, pixels: 1024 }).source).toBe('density')
    }
  })

  it('degrades to the historical 1 m tile when nothing at all is known', () => {
    expect(resolveTileSize({})).toEqual({ metres: 1, source: 'fallback' })
  })

  it('clamps a period that would moiré or never repeat', () => {
    expect(resolveTileSize({ scanMetres: 0.01 }).metres).toBe(MIN_TILE_M)
    expect(resolveTileSize({ scanMetres: 40 }).metres).toBe(MAX_TILE_M)
  })
})

describe('texelDensity / isMagnified', () => {
  it('measures px per metre', () => {
    expect(texelDensity(1024, 2)).toBe(512)
    expect(texelDensity(512, 1.9)).toBeCloseTo(269, 0) // the shipped oak floor
  })

  it('flags a map asked to cover more floor than its texels describe', () => {
    expect(isMagnified(1024, 1)).toBe(false) // 1024 px/m — plenty
    expect(isMagnified(1024, 4)).toBe(true) // 256 px/m — soft
  })

  it('is safe on degenerate input', () => {
    expect(texelDensity(0, 1)).toBe(0)
    expect(texelDensity(1024, 0)).toBe(0)
  })
})

describe('maxScaleForMap', () => {
  it('says how far a user may scale a finish up before it blurs', () => {
    // A 1K map on a 1 m period has 2x of headroom before it hits the target.
    expect(maxScaleForMap(1024, 1)).toBeCloseTo(2, 6)
    // Already at the target → no headroom (never below 1: 1x is always allowed).
    expect(maxScaleForMap(1024, 2)).toBe(1)
    expect(maxScaleForMap(1024, 8)).toBe(1)
  })

  it('does not constrain a map whose resolution we do not know', () => {
    expect(maxScaleForMap(null, 1)).toBe(Number.POSITIVE_INFINITY)
    expect(maxScaleForMap(undefined, 1)).toBe(Number.POSITIVE_INFINITY)
  })

  it('is consistent with the density target it is derived from', () => {
    expect(maxScaleForMap(TARGET_TEXEL_DENSITY, 1)).toBe(1)
  })
})
