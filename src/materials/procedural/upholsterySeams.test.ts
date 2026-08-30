import { describe, expect, it } from 'vitest'
import { makeFbm, NYQUIST_CYCLES_PER_TEXEL, topOctaveCyclesPerTexel } from './noise'
import {
  buildUpholsteryHeight,
  DEFAULT_SEAM_PARAMS,
  FABRIC_FIELDS,
  FABRIC_WEAVE_CYCLES_PER_TEXEL,
  type SeamParams,
  THREAD_GAIN,
  threadGain,
} from './upholsterySeams'

const SIZE = 64

describe('buildUpholsteryHeight (RZ6 upholstery seams + wrinkle)', () => {
  it('returns a row-major height field of size*size, all in 0..1', () => {
    const h = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(h).toBeInstanceOf(Float32Array)
    expect(h.length).toBe(SIZE * SIZE)
    for (let i = 0; i < h.length; i++) {
      expect(h[i]).toBeGreaterThanOrEqual(0)
      expect(h[i]).toBeLessThanOrEqual(1)
      expect(Number.isFinite(h[i])).toBe(true)
    }
  })

  it('is deterministic for the same seed + params', () => {
    const a = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    const b = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(Array.from(a)).toEqual(Array.from(b))
  })

  it('changes with the seed (not a constant field)', () => {
    const a = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    const b = buildUpholsteryHeight(SIZE, 0x9999, DEFAULT_SEAM_PARAMS)
    expect(Array.from(a)).not.toEqual(Array.from(b))
  })

  it('seam=0 + wrinkle=0 drops both channels (differs from full default)', () => {
    const plain: SeamParams = { seam: 0, wrinkle: 0, panels: 2 }
    const weaveOnly = buildUpholsteryHeight(SIZE, 0x4242, plain)
    const full = buildUpholsteryHeight(SIZE, 0x4242, DEFAULT_SEAM_PARAMS)
    expect(Array.from(weaveOnly)).not.toEqual(Array.from(full))
  })

  it('seam channel carves a recess on the panel edge (lower than mid-panel)', () => {
    // panels=2 → seams at u=0, 0.5, 1. Compare the height on the seam line at
    // u=0.5 against mid-panel u=0.25, averaged down a column to cancel the
    // weave/wrinkle noise so the seam valley dominates.
    const seamOnly: SeamParams = { seam: 1, wrinkle: 0, panels: 2 }
    const h = buildUpholsteryHeight(SIZE, 0x4242, seamOnly)
    const xSeam = Math.round(0.5 * SIZE)
    const xMid = Math.round(0.25 * SIZE)
    let seamSum = 0
    let midSum = 0
    for (let y = 0; y < SIZE; y++) {
      seamSum += h[y * SIZE + xSeam]
      midSum += h[y * SIZE + xMid]
    }
    expect(seamSum / SIZE).toBeLessThan(midSum / SIZE)
  })

  it('wrinkle adds relief variance over the weave-only baseline', () => {
    const variance = (h: Float32Array) => {
      let mean = 0
      for (const v of h) mean += v
      mean /= h.length
      let s = 0
      for (const v of h) s += (v - mean) ** 2
      return s / h.length
    }
    const weaveOnly = buildUpholsteryHeight(SIZE, 0x4242, { seam: 0, wrinkle: 0, panels: 2 })
    const withWrinkle = buildUpholsteryHeight(SIZE, 0x4242, { seam: 0, wrinkle: 1, panels: 2 })
    expect(variance(withWrinkle)).toBeGreaterThan(variance(weaveOnly))
  })

  it('clamps a degenerate panels value to a valid grid (no NaN)', () => {
    const h = buildUpholsteryHeight(SIZE, 0x4242, { seam: 1, wrinkle: 1, panels: 0 })
    expect(h.length).toBe(SIZE * SIZE)
    for (let i = 0; i < h.length; i++) expect(Number.isFinite(h[i])).toBe(true)
  })
})

// FABRIC-FINE-NYQUIST — every fbm field the upholstery height is built from must
// be resolvable in the tile it is baked into. The `fine` field shipped at 3.75
// cycles per texel (seven times the limit), so a fifth of the height amplitude
// was deterministic white noise, which `heightToNormalRGBA` turned into a
// per-texel random normal: the pebbly plastic look, exactly as WOOD-PORE-NYQUIST.
describe('fabric field frequencies stay resolvable (FABRIC-FINE-NYQUIST)', () => {
  /** The tile the upholstery normal is baked into (`furnitureMaterials.ts:N`). */
  const TILE = 256

  it('reproduces the shipped-broken `fine` field as wildly undersampled', () => {
    // Documented as a test so the number in the docstring stays honest.
    expect(topOctaveCyclesPerTexel(120, 4, 1, TILE)).toBeCloseTo(3.75, 2)
    expect(topOctaveCyclesPerTexel(120, 4, 1, TILE)).toBeGreaterThan(NYQUIST_CYCLES_PER_TEXEL * 7)
  })

  it('keeps every field inside the tile Nyquist limit', () => {
    for (const [name, f] of Object.entries(FABRIC_FIELDS)) {
      const top = topOctaveCyclesPerTexel(f.baseFreq, f.octaves, f.uvScale, TILE)
      expect(top, `${name} aliases at ${top.toFixed(2)} cycles/texel`).toBeLessThan(
        NYQUIST_CYCLES_PER_TEXEL,
      )
    }
  })

  it('bounds the sub-weave fuzz by the WEAVE, which is itself near the limit', () => {
    // The weave grid is sin(x * 2.4) ~ 0.38 cycles/texel, so there is no room for
    // a field ten times finer in a 256 tile. The fuzz may be comparable to the
    // weave; it may not pretend to be an order of magnitude below it.
    expect(FABRIC_WEAVE_CYCLES_PER_TEXEL).toBeGreaterThan(0.3)
    expect(FABRIC_WEAVE_CYCLES_PER_TEXEL).toBeLessThan(NYQUIST_CYCLES_PER_TEXEL)
    const fine = topOctaveCyclesPerTexel(
      FABRIC_FIELDS.fine.baseFreq,
      FABRIC_FIELDS.fine.octaves,
      FABRIC_FIELDS.fine.uvScale,
      TILE,
    )
    expect(fine).toBeLessThan(FABRIC_WEAVE_CYCLES_PER_TEXEL * 1.2)
  })

  it('the FINE channel is resolved, where the old parameters were white noise', () => {
    // Measured on the `fine` channel ALONE, which is the one this fix changed.
    // The whole height field cannot be used for this: its dominant term is the
    // weave grid at `sin(x * 2.4)`, a period of only ~2.6 texels, so the summed
    // field legitimately has neighbour steps as large as its own spread (measured
    // 0.119 vs sd 0.114) whether or not the fuzz aliases. Isolating the channel
    // is what makes the assertion mean anything.
    const size = 256
    const ratio = (octaves: number, baseFreq: number) => {
      const f = makeFbm(0x4242, octaves, baseFreq)
      const vals: number[] = []
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) vals.push(f(x / size, y / size))
      let step = 0
      let n = 0
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size - 1; x++) {
          step += Math.abs(vals[y * size + x + 1] - vals[y * size + x])
          n++
        }
      }
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
      return step / n / sd
    }
    const fixed = ratio(FABRIC_FIELDS.fine.octaves, FABRIC_FIELDS.fine.baseFreq)
    const broken = ratio(4, 120)
    // Measured: fixed 0.105, broken 0.732, and a deliberately-degenerate
    // single-octave 2000-cycle field (as close to white noise as this generator
    // gets) 1.133. So the shipped field was ~65% of the way to pure noise and the
    // fix is a tenth of that. Bounds are set from those measurements — loose
    // enough not to be brittle, tight enough that restoring `baseFreq: 120`
    // fails the second and third assertions.
    expect(fixed).toBeLessThan(0.2)
    expect(broken).toBeGreaterThan(0.6)
    expect(fixed).toBeLessThan(broken / 5)
  })
})

describe('threadGain — cloth, not a lattice', () => {
  it('averages 1, so the weave keeps its mean and its amplitude', () => {
    let sum = 0
    const N = 4000
    for (let i = 0; i < N; i++) sum += threadGain(i, 7)
    // Missed picks pull the mean slightly below 1 by design; the point is that
    // the variation does not silently brighten or darken the cloth.
    expect(sum / N).toBeGreaterThan(0.9)
    expect(sum / N).toBeLessThan(1.06)
  })

  it('gives neighbouring threads DIFFERENT thicknesses — the whole point', () => {
    const vals = Array.from({ length: 40 }, (_, i) => threadGain(i, 3))
    expect(new Set(vals.map((v) => v.toFixed(4))).size).toBeGreaterThan(30)
  })

  it('is deterministic and salt-separated, so warp and weft never march together', () => {
    expect(threadGain(12, 3)).toBe(threadGain(12, 3))
    let same = 0
    for (let i = 0; i < 200; i++) if (threadGain(i, 3) === threadGain(i, 4)) same++
    expect(same).toBeLessThan(5)
  })

  it('drops the occasional thin pick, but only occasionally', () => {
    let thin = 0
    for (let i = 0; i < 2000; i++) if (threadGain(i, 11) === THREAD_GAIN.missGain) thin++
    expect(thin / 2000).toBeGreaterThan(0.02)
    expect(thin / 2000).toBeLessThan(0.14)
  })

  it('never goes negative or runaway — the height field stays bounded', () => {
    for (let i = -500; i < 500; i++) {
      const v = threadGain(i, 5)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(2)
    }
  })
})
