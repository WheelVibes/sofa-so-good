import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TILE_SURFACE_PARAMS,
  GLAZE_ROUGHNESS,
  GROUT_ROUGHNESS,
  glazeRoughness,
  makeGlazePeel,
} from './tileSurface'

const SIZE = 64
const SEED = 0x4242

describe('makeGlazePeel (MAT-002 glaze orange-peel micro-normal)', () => {
  it('returns a finite signed delta bounded by the tasteful amplitude', () => {
    const peel = makeGlazePeel(SEED, DEFAULT_TILE_SURFACE_PARAMS.glaze)
    let min = Infinity
    let max = -Infinity
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = peel(x / SIZE, y / SIZE)
        expect(Number.isFinite(v)).toBe(true)
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    // Centred on 0 (signed relief), and small — the glaze ripples by microns.
    expect(min).toBeLessThan(0)
    expect(max).toBeGreaterThan(0)
    expect(Math.abs(min)).toBeLessThanOrEqual(0.06)
    expect(Math.abs(max)).toBeLessThanOrEqual(0.06)
  })

  it('is deterministic for the same seed', () => {
    const a = makeGlazePeel(SEED, 1)
    const b = makeGlazePeel(SEED, 1)
    for (let i = 0; i < 50; i++) {
      const u = (i * 7) / 100
      const v = (i * 11) / 100
      expect(a(u, v)).toBe(b(u, v))
    }
  })

  it('changes with the seed (not a constant field)', () => {
    const a = makeGlazePeel(SEED, 1)
    const b = makeGlazePeel(0x9999, 1)
    let differs = false
    for (let i = 0; i < 50 && !differs; i++) {
      if (a(i / 50, 0.3) !== b(i / 50, 0.3)) differs = true
    }
    expect(differs).toBe(true)
  })

  it('glaze=0 cleanly drops the orange-peel (flat zero everywhere)', () => {
    const peel = makeGlazePeel(SEED, 0)
    for (let i = 0; i < 50; i++) expect(peel(i / 50, i / 70)).toBe(0)
  })

  it('scales linearly with the glaze intensity', () => {
    const full = makeGlazePeel(SEED, 1)
    const half = makeGlazePeel(SEED, 0.5)
    for (let i = 1; i < 30; i++) {
      const u = i / 30
      const v = (i * 3) / 30
      // Same underlying fbm, half amplitude → exactly half the delta.
      expect(half(u, v)).toBeCloseTo(full(u, v) * 0.5, 10)
    }
  })
})

describe('glazeRoughness (MAT-002 glaze↔grout roughness contrast)', () => {
  it('grout reads markedly rougher than the glaze at full contrast', () => {
    const groutR = glazeRoughness(true, 1, 0)
    const glazeR = glazeRoughness(false, 1, 0)
    expect(groutR).toBe(GROUT_ROUGHNESS)
    expect(glazeR).toBe(GLAZE_ROUGHNESS)
    // The contrast is the whole point — grout much rougher than the glaze.
    expect(groutR - glazeR).toBeGreaterThan(0.5)
  })

  it('grout=0 collapses the contrast — both sit at the glaze roughness', () => {
    expect(glazeRoughness(true, 0, 0)).toBe(GLAZE_ROUGHNESS)
    expect(glazeRoughness(false, 0, 0)).toBe(GLAZE_ROUGHNESS)
  })

  it('blends toward the targets with the contrast intensity', () => {
    const half = glazeRoughness(true, 0.5, 0)
    expect(half).toBeGreaterThan(GLAZE_ROUGHNESS)
    expect(half).toBeLessThan(GROUT_ROUGHNESS)
    expect(half).toBeCloseTo(GLAZE_ROUGHNESS + (GROUT_ROUGHNESS - GLAZE_ROUGHNESS) * 0.5, 10)
  })

  it('folds in the micro break-up and clamps to 0..1', () => {
    expect(glazeRoughness(false, 1, 0.05)).toBeCloseTo(GLAZE_ROUGHNESS + 0.05, 10)
    // Clamp: grout near 0.92 + a big positive micro stays ≤ 1.
    expect(glazeRoughness(true, 1, 0.5)).toBe(1)
    // Clamp: glaze with a big negative micro stays ≥ 0.
    expect(glazeRoughness(false, 1, -1)).toBe(0)
  })
})
