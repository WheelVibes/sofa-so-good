import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONCRETE_SURFACE_PARAMS,
  DEFAULT_STONE_SURFACE_PARAMS,
  makePinholePores,
  makeRoughDrift,
  veinHeight,
} from './stoneSurface'

const SIZE = 64
const SEED = 0x5a17

describe('veinHeight (MAT-001 vein normal-relief)', () => {
  it('is proportional to the vein mask and to the intensity (aligns with the visible vein)', () => {
    // No vein → no relief (flat face baseline).
    expect(veinHeight(0, 1)).toBe(0)
    // A masked vein lifts; a stronger mask lifts more — monotone in the mask, so
    // the relief peaks exactly where the albedo vein is darkest.
    const faint = veinHeight(0.3, 1)
    const full = veinHeight(1, 1)
    expect(faint).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(faint)
  })

  it('scales linearly with the intensity', () => {
    expect(veinHeight(1, 0.5)).toBeCloseTo(veinHeight(1, 1) * 0.5, 12)
  })

  it('veinRelief=0 cleanly drops the relief (veins become albedo-only)', () => {
    for (const mask of [0, 0.25, 0.5, 1]) expect(veinHeight(mask, 0)).toBe(0)
  })

  it('stays bounded by a tasteful amplitude', () => {
    // Even a fully-masked vein at full intensity is a shallow lift, not a ridge.
    expect(veinHeight(1, 1)).toBeLessThanOrEqual(0.4)
  })
})

describe('makeRoughDrift (MAT-001 polished roughness drift)', () => {
  it('returns a finite signed delta bounded by the tasteful amplitude', () => {
    const drift = makeRoughDrift(SEED, DEFAULT_STONE_SURFACE_PARAMS.roughDrift)
    let min = Infinity
    let max = -Infinity
    let present = false
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = drift(x / SIZE, y / SIZE)
        expect(Number.isFinite(v)).toBe(true)
        if (v !== 0) present = true
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    // A real drift is present (not a flat zero), centred on 0 (signed), small.
    expect(present).toBe(true)
    expect(min).toBeLessThan(0)
    expect(max).toBeGreaterThan(0)
    expect(Math.abs(min)).toBeLessThanOrEqual(0.05)
    expect(Math.abs(max)).toBeLessThanOrEqual(0.05)
  })

  it('is deterministic for the same seed', () => {
    const a = makeRoughDrift(SEED, 1)
    const b = makeRoughDrift(SEED, 1)
    for (let i = 0; i < 50; i++) {
      const u = (i * 7) / 100
      const v = (i * 11) / 100
      expect(a(u, v)).toBe(b(u, v))
    }
  })

  it('changes with the seed (not a constant field)', () => {
    const a = makeRoughDrift(SEED, 1)
    const b = makeRoughDrift(0x9999, 1)
    let differs = false
    for (let i = 0; i < 50 && !differs; i++) {
      if (a(i / 50, 0.3) !== b(i / 50, 0.3)) differs = true
    }
    expect(differs).toBe(true)
  })

  it('roughDrift=0 cleanly drops the drift (flat zero everywhere)', () => {
    const drift = makeRoughDrift(SEED, 0)
    for (let i = 0; i < 50; i++) expect(drift(i / 50, i / 70)).toBe(0)
  })

  it('scales linearly with the drift intensity', () => {
    const full = makeRoughDrift(SEED, 1)
    const half = makeRoughDrift(SEED, 0.5)
    for (let i = 1; i < 30; i++) {
      const u = i / 30
      const v = (i * 3) / 30
      expect(half(u, v)).toBeCloseTo(full(u, v) * 0.5, 10)
    }
  })
})

describe('makePinholePores (CONCRETE-PORES fine pinhole roughness)', () => {
  const G = 96 // sample grid

  it('is a sparse, non-negative, finite roughness lift (scattered pinholes, not polka-dots)', () => {
    const pore = makePinholePores(SEED, DEFAULT_CONCRETE_SURFACE_PARAMS.pores)
    let open = 0
    let total = 0
    let max = -Infinity
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const v = pore(x / G, y / G)
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0) // a lift, never lowers roughness
        if (v > 0) open++
        if (v > max) max = v
        total++
      }
    }
    // A real pinhole field is present…
    expect(open).toBeGreaterThan(0)
    // …but SPARSE — most of the face is the sealed (zero-lift) base, so this
    // reads as scattered pinholes rather than an even spotted pattern.
    expect(open).toBeLessThan(total * 0.5)
    // …and stays a tasteful micro lift, never a crater.
    expect(max).toBeLessThanOrEqual(0.16)
  })

  it('is deterministic for the same seed', () => {
    const a = makePinholePores(SEED, 1)
    const b = makePinholePores(SEED, 1)
    for (let i = 0; i < 60; i++) {
      const u = (i * 7) / 100
      const v = (i * 13) / 100
      expect(a(u, v)).toBe(b(u, v))
    }
  })

  it('changes with the seed (the pinholes land elsewhere)', () => {
    const a = makePinholePores(SEED, 1)
    const b = makePinholePores(0x9999, 1)
    // Scan a full 2D grid — the field is sparse, so a single scan line may sit
    // entirely below threshold for both seeds; the grid catches the pinholes.
    let differs = false
    for (let y = 0; y < G && !differs; y++) {
      for (let x = 0; x < G && !differs; x++) {
        if (a(x / G, y / G) !== b(x / G, y / G)) differs = true
      }
    }
    expect(differs).toBe(true)
  })

  it('pores=0 cleanly drops the term (flat zero everywhere)', () => {
    const pore = makePinholePores(SEED, 0)
    for (let i = 0; i < 60; i++) expect(pore(i / 60, i / 80)).toBe(0)
  })

  it('scales linearly with the intensity', () => {
    const full = makePinholePores(SEED, 1)
    const half = makePinholePores(SEED, 0.5)
    for (let i = 1; i < 40; i++) {
      const u = i / 40
      const v = (i * 3) / 40
      expect(half(u, v)).toBeCloseTo(full(u, v) * 0.5, 10)
    }
  })
})
