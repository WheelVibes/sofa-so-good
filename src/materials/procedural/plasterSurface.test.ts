import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLASTER_SURFACE_PARAMS,
  makeRollerNap,
  NAP_DRIFT_AMPLITUDE,
} from './plasterSurface'

const SIZE = 64
const SEED = 0x91a7
/** The matte base the painter adds the nap drift onto (mirrors `wall.ts`). */
const PLASTER_BASE_ROUGHNESS = 0.92

describe('makeRollerNap (MAT-003 roller-nap roughness drift)', () => {
  it('returns a finite signed delta bounded by the tasteful amplitude', () => {
    const nap = makeRollerNap(SEED, DEFAULT_PLASTER_SURFACE_PARAMS.nap)
    let min = Infinity
    let max = -Infinity
    let present = false
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = nap(x / SIZE, y / SIZE)
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
    // The broad/fine weights sum to 1, so the combined drift can never exceed the
    // single tasteful amplitude — a whisper, not a stucco crust.
    expect(Math.abs(min)).toBeLessThanOrEqual(NAP_DRIFT_AMPLITUDE + 1e-9)
    expect(Math.abs(max)).toBeLessThanOrEqual(NAP_DRIFT_AMPLITUDE + 1e-9)
  })

  it('keeps the wall clearly MATTE when added to the base roughness', () => {
    // The whole point: drift the matte base WITHOUT ever approaching gloss.
    const nap = makeRollerNap(SEED, 1)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const r = PLASTER_BASE_ROUGHNESS + nap(x / SIZE, y / SIZE)
        // Stays high (matte): well above any glossy/semi-gloss range.
        expect(r).toBeGreaterThan(0.85)
        expect(r).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    const a = makeRollerNap(SEED, 1)
    const b = makeRollerNap(SEED, 1)
    for (let i = 0; i < 50; i++) {
      const u = (i * 7) / 100
      const v = (i * 11) / 100
      expect(a(u, v)).toBe(b(u, v))
    }
  })

  it('changes with the seed (not a constant field)', () => {
    const a = makeRollerNap(SEED, 1)
    const b = makeRollerNap(0x2222, 1)
    let differs = false
    for (let i = 0; i < 50 && !differs; i++) {
      if (a(i / 50, 0.3) !== b(i / 50, 0.3)) differs = true
    }
    expect(differs).toBe(true)
  })

  it('scales linearly with the intensity', () => {
    const full = makeRollerNap(SEED, 1)
    const half = makeRollerNap(SEED, 0.5)
    for (let i = 0; i < 30; i++) {
      const u = (i * 3) / 50
      const v = (i * 5) / 50
      expect(half(u, v)).toBeCloseTo(full(u, v) * 0.5, 12)
    }
  })

  it('nap=0 cleanly drops the drift (flat zero everywhere)', () => {
    const nap = makeRollerNap(SEED, 0)
    for (let i = 0; i < 50; i++) expect(nap(i / 50, i / 70)).toBe(0)
  })
})
