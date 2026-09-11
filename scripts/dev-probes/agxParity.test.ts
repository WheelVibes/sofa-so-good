import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations, like the probes
// themselves; the pure helpers are still worth testing (see `probeImports.test.ts` for why the
// probe directory is in the test scope at all).
import { compare, mapAppCountToBlender, probeValues } from './agx-parity.mjs'

/**
 * AGX-PARITY — the pure halves of the probe.
 *
 * The measurement itself needs a GPU and a Blender install, so it cannot run here. What CAN run is
 * everything that decides *what* is measured and *how the numbers are combined* — and those are
 * where a silent error would be most expensive, because it would look like a graphics finding.
 */
describe('probeValues', () => {
  it('spans deep shadow to a blown window, log-spaced about middle grey', () => {
    const greys = probeValues().filter(([r, g, b]) => r === g && g === b)
    const levels = greys.map(([g]) => g)
    // 0.18 is middle grey and must be sampled EXACTLY — every published figure in the arc is
    // quoted relative to it, and an interpolated middle grey would quietly move them.
    expect(levels.some((v) => Math.abs(v - 0.18) < 1e-12)).toBe(true)
    expect(Math.min(...levels)).toBeLessThan(0.18 / 128)
    expect(Math.max(...levels)).toBeGreaterThan(0.18 * 32)
    // Monotone, so the LUT it produces can be inverted.
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeGreaterThan(levels[i - 1])
  })

  it('probes CHROMA, not just the neutral axis', () => {
    // AgX rotates through Rec.2020 via its inset/outset matrices, so it is not a per-channel
    // curve. A neutral-only probe set cannot see a hue error and would have reported parity.
    const chroma = probeValues().filter(([r, g, b]) => !(r === g && g === b))
    expect(chroma.length).toBeGreaterThan(12)
    // Saturated AND partly-desaturated, at more than one level: the outset matrix's effect
    // depends on both.
    expect(chroma.some(([r, g, b]) => [r, g, b].filter((v) => v > 0).length === 1)).toBe(true)
    expect(chroma.some(([r, g, b]) => [r, g, b].filter((v) => v > 0).length === 3)).toBe(true)
  })

  it('makes the dense ramp neutral, monotone and fine enough to invert', () => {
    const dense = probeValues(true)
    expect(dense.length).toBeGreaterThan(200)
    expect(dense.every(([r, g, b]) => r === g && g === b)).toBe(true)
    for (let i = 1; i < dense.length; i++) expect(dense[i][0]).toBeGreaterThan(dense[i - 1][0])
  })
})

describe('compare', () => {
  it('reports the SIGNED mean, not only the absolute one', () => {
    // The finding is a BIAS — three reads brighter than Blender almost everywhere. An
    // absolute-only summary would have described that as scatter.
    const a = { values: [[1, 1, 1]], counts: [[10, 12, 14]] }
    const b = { values: [[1, 1, 1]], counts: [[8, 8, 8]] }
    const { summary } = compare(a, b, 'three', 'blender')
    expect(summary.meanSigned).toBeCloseTo(4, 6)
    expect(summary.meanAbs).toBeCloseTo(4, 6)
    expect(summary.maxAbs).toBe(6)
  })

  it('keeps signed and absolute distinct when the deltas cancel', () => {
    const a = { values: [[1, 1, 1]], counts: [[10, 6, 8]] }
    const b = { values: [[1, 1, 1]], counts: [[8, 8, 8]] }
    const { summary } = compare(a, b, 'three', 'blender')
    expect(summary.meanSigned).toBeCloseTo(0, 6)
    // 3 dp: `compare` rounds its summary, which is deliberate — the inputs are integer counts,
    // so more places would imply a precision the measurement does not have.
    expect(summary.meanAbs).toBeCloseTo(4 / 3, 3)
  })
})

describe('mapAppCountToBlender', () => {
  // A two-point LUT with a deliberately different slope per side, so an inverted or transposed
  // interpolation cannot pass.
  const dense = {
    three: {
      values: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      counts: [
        [0, 0, 0],
        [200, 200, 200],
      ],
    },
    blender: {
      values: [
        [0, 0, 0],
        [1, 1, 1],
      ],
      counts: [
        [0, 0, 0],
        [100, 100, 100],
      ],
    },
  }

  it('inverts three, then applies Blender', () => {
    const r = mapAppCountToBlender(dense, 100)
    expect(r.linear).toBeCloseTo(0.5, 6)
    expect(r.blender).toBeCloseTo(50, 6)
  })

  it('clamps outside the sampled range rather than extrapolating', () => {
    // Extrapolating a log-domain transform past its sampled range produces confident nonsense;
    // the arc's rule is that a measurement states its range.
    expect(mapAppCountToBlender(dense, -10).blender).toBeCloseTo(0, 6)
    expect(mapAppCountToBlender(dense, 999).blender).toBeCloseTo(100, 6)
  })
})
