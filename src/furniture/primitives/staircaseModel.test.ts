import { describe, expect, it } from 'vitest'
import {
  buildStaircase,
  type StaircasePart,
  type StaircaseSpec,
  sanitizeStaircase,
} from './staircaseModel'

const base: StaircaseSpec = {
  style: 'straight',
  steps: 13,
  width: 0.9,
  riserHeight: 0.17,
  treadDepth: 0.26,
  railing: 'none',
}

const treads = (parts: StaircasePart[]) => parts.filter((p) => p.kind === 'tread')
/** Top Y of a part's box. */
const top = (p: StaircasePart) => p.position[1] + p.size[1] / 2
const bottom = (p: StaircasePart) => p.position[1] - p.size[1] / 2

describe('buildStaircase', () => {
  describe('straight', () => {
    it('has exactly `steps` treads', () => {
      expect(treads(buildStaircase(base))).toHaveLength(13)
      expect(treads(buildStaircase({ ...base, steps: 7 }))).toHaveLength(7)
    })

    it('total rise ≈ steps × riserHeight', () => {
      const t = treads(buildStaircase(base))
      const highest = Math.max(...t.map(top))
      expect(highest).toBeCloseTo(base.steps * base.riserHeight, 6)
    })

    it('treads ascend by exactly riserHeight with no overlap or gap in Y', () => {
      const t = treads(buildStaircase(base)).sort((a, b) => a.position[1] - b.position[1])
      for (let i = 1; i < t.length; i++) {
        expect(top(t[i]) - top(t[i - 1])).toBeCloseTo(base.riserHeight, 6)
      }
      // The whole step (tread + the riser below it) is gap-free: each tread's
      // bottom meets the previous tread's top within the riser fill.
      const risers = buildStaircase(base).filter((p) => p.kind === 'riser')
      expect(risers.length).toBeGreaterThan(0)
      // Lowest riser starts at the floor (Y=0).
      const lowest = risers.sort((a, b) => bottom(a) - bottom(b))[0]
      expect(bottom(lowest)).toBeCloseTo(0, 6)
    })

    it('the first riser sits on the floor (nothing floats)', () => {
      const risers = buildStaircase(base).filter((p) => p.kind === 'riser')
      const minBottom = Math.min(...risers.map(bottom))
      expect(minBottom).toBeCloseTo(0, 6)
    })

    it('treads are footprint-centred on Z', () => {
      const t = treads(buildStaircase(base))
      const zs = t.map((p) => p.position[2])
      const center = (Math.min(...zs) + Math.max(...zs)) / 2
      expect(center).toBeCloseTo(0, 6)
    })
  })

  describe('railings', () => {
    it('emits no posts/rails when railing is none', () => {
      const parts = buildStaircase(base)
      expect(parts.some((p) => p.kind === 'post' || p.kind === 'rail')).toBe(false)
    })

    it('side railing adds one post + rail per tread; both adds two', () => {
      const n = base.steps
      const side = buildStaircase({ ...base, railing: 'side' })
      expect(side.filter((p) => p.kind === 'post')).toHaveLength(n)
      expect(side.filter((p) => p.kind === 'rail')).toHaveLength(n)
      const both = buildStaircase({ ...base, railing: 'both' })
      expect(both.filter((p) => p.kind === 'post')).toHaveLength(2 * n)
    })

    it('posts reach down to a tread top (no floating posts)', () => {
      const parts = buildStaircase({ ...base, railing: 'side' })
      const treadTops = new Set(treads(parts).map((p) => top(p).toFixed(4)))
      for (const post of parts.filter((p) => p.kind === 'post')) {
        expect(treadTops.has(bottom(post).toFixed(4))).toBe(true)
      }
    })
  })

  describe('lshape', () => {
    it('has a landing and `steps` treads split across two flights', () => {
      const parts = buildStaircase({ ...base, style: 'lshape' })
      expect(parts.filter((p) => p.kind === 'landing')).toHaveLength(1)
      expect(treads(parts)).toHaveLength(base.steps)
    })

    it('the second flight is rotated 90° (uses different tread orientations)', () => {
      const t = treads(buildStaircase({ ...base, style: 'lshape' }))
      const rots = new Set(t.map((p) => (p.rot ?? 0).toFixed(4)))
      expect(rots.size).toBeGreaterThan(1)
    })

    it('total rise still ≈ steps × riserHeight', () => {
      const t = treads(buildStaircase({ ...base, style: 'lshape' }))
      expect(Math.max(...t.map(top))).toBeCloseTo(base.steps * base.riserHeight, 6)
    })
  })

  describe('ushape', () => {
    it('has a landing and `steps` treads', () => {
      const parts = buildStaircase({ ...base, style: 'ushape' })
      expect(parts.filter((p) => p.kind === 'landing')).toHaveLength(1)
      expect(treads(parts)).toHaveLength(base.steps)
    })
  })

  describe('spiral', () => {
    it('has one central newel and `steps` treads', () => {
      const parts = buildStaircase({ ...base, style: 'spiral' })
      expect(parts.filter((p) => p.kind === 'newel')).toHaveLength(1)
      expect(treads(parts)).toHaveLength(base.steps)
    })

    it('all treads share a centre (the newel at the origin)', () => {
      const parts = buildStaircase({ ...base, style: 'spiral' })
      const newel = parts.find((p) => p.kind === 'newel')!
      expect(newel.position[0]).toBeCloseTo(0, 6)
      expect(newel.position[2]).toBeCloseTo(0, 6)
      // Every tread is the same radial distance from the centre.
      const t = treads(parts)
      const radii = t.map((p) => Math.hypot(p.position[0], p.position[2]))
      for (const r of radii) expect(r).toBeCloseTo(radii[0], 6)
    })

    it('newel spans the full rise from the floor', () => {
      const parts = buildStaircase({ ...base, style: 'spiral' })
      const newel = parts.find((p) => p.kind === 'newel')!
      expect(bottom(newel)).toBeCloseTo(0, 6)
      expect(top(newel)).toBeCloseTo(base.steps * base.riserHeight, 6)
    })
  })

  describe('edge cases', () => {
    it('builds a single-step staircase', () => {
      const parts = buildStaircase({ ...base, steps: 1 })
      expect(treads(parts)).toHaveLength(1)
      expect(Math.max(...treads(parts).map(top))).toBeCloseTo(base.riserHeight, 6)
    })

    it('handles a large step count', () => {
      const parts = buildStaircase({ ...base, steps: 200 })
      expect(treads(parts)).toHaveLength(200)
      expect(Math.max(...treads(parts).map(top))).toBeCloseTo(200 * base.riserHeight, 4)
    })

    it('clamps zero/negative/non-finite dimensions and step counts', () => {
      const s = sanitizeStaircase({
        style: 'straight',
        steps: 0,
        width: 0,
        riserHeight: -1,
        treadDepth: Number.NaN,
        railing: 'none',
      })
      expect(s.steps).toBeGreaterThanOrEqual(1)
      expect(s.width).toBeGreaterThan(0)
      expect(s.riserHeight).toBeGreaterThan(0)
      expect(s.treadDepth).toBeGreaterThan(0)
      // And the builder produces valid (positive-sized) geometry from bad input.
      const parts = buildStaircase({
        style: 'straight',
        steps: -5,
        width: -2,
        riserHeight: 0,
        treadDepth: 0,
        railing: 'both',
      })
      expect(parts.length).toBeGreaterThan(0)
      for (const p of parts) {
        for (const dim of p.size) expect(dim).toBeGreaterThan(0)
      }
    })

    it('rounds fractional step counts to a whole number', () => {
      expect(sanitizeStaircase({ ...base, steps: 5.7 }).steps).toBe(6)
    })
  })
})
