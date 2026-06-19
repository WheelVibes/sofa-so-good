import { describe, expect, it } from 'vitest'
import { CORNER_AO_REACH, cornerAoEnabledForTier, cornerAoStripDims } from './cornerAoMath'
import { QUALITY_PRESETS, RENDER_TIERS } from './quality'

describe('cornerAoEnabledForTier', () => {
  it('enables baked corner AO only on the post-AO-less tiers (performance, medium)', () => {
    expect(cornerAoEnabledForTier('performance')).toBe(true)
    expect(cornerAoEnabledForTier('medium')).toBe(true)
  })

  it('disables it on high+ where the post-processing SSAO pass runs (no double-darkening)', () => {
    expect(cornerAoEnabledForTier('high')).toBe(false)
    expect(cornerAoEnabledForTier('maximum')).toBe(false)
  })

  it('agrees with the shipped quality presets (predicate ⇔ preset.cornerAo)', () => {
    for (const t of RENDER_TIERS) {
      expect(QUALITY_PRESETS[t].cornerAo).toBe(cornerAoEnabledForTier(t))
    }
  })

  it('never runs the baked strip on a tier that already has the post stack', () => {
    for (const t of RENDER_TIERS) {
      const p = QUALITY_PRESETS[t]
      if (p.postprocessing) expect(p.cornerAo).toBe(false)
    }
  })
})

describe('cornerAoStripDims', () => {
  it('reaches into the room from the +Z face by the configured reach', () => {
    const { length, depth, zCenter } = cornerAoStripDims(2, 0.1, 1)
    expect(length).toBe(2)
    expect(depth).toBe(CORNER_AO_REACH)
    // Face at +0.05; centre is half a reach further out (+Z).
    expect(zCenter).toBeCloseTo(0.05 + CORNER_AO_REACH / 2, 6)
  })

  it('mirrors to the -Z side for the negative face', () => {
    const { zCenter } = cornerAoStripDims(2, 0.1, -1)
    expect(zCenter).toBeCloseTo(-(0.05 + CORNER_AO_REACH / 2), 6)
  })

  it('the strip always begins flush against the wall face (no gap, no overlap into the body)', () => {
    const thickness = 0.2
    for (const sign of [1, -1] as const) {
      const reach = 0.3
      const { depth, zCenter } = cornerAoStripDims(1, thickness, sign, reach)
      const faceZ = sign * (thickness / 2)
      const innerEdge = zCenter - sign * (depth / 2)
      expect(innerEdge).toBeCloseTo(faceZ, 6)
    }
  })

  it('honours a custom reach', () => {
    const { depth } = cornerAoStripDims(1, 0.1, 1, 0.5)
    expect(depth).toBe(0.5)
  })
})
