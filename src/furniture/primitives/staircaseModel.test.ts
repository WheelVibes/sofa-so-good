import { BoxGeometry, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { bakeInstanceMatrix } from './InstancedBoxes'
import {
  buildStaircase,
  type StaircasePart,
  type StaircaseSpec,
  sanitizeStaircase,
  staircaseFootprintParts,
  staircaseInstanceBuckets,
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

    it('adds one post per tread + ONE continuous rail per flight side (both = two)', () => {
      const n = base.steps
      const side = buildStaircase({ ...base, railing: 'side' })
      expect(side.filter((p) => p.kind === 'post')).toHaveLength(n)
      // A straight staircase is one flight → exactly one rail on the railed side.
      expect(side.filter((p) => p.kind === 'rail')).toHaveLength(1)
      const both = buildStaircase({ ...base, railing: 'both' })
      expect(both.filter((p) => p.kind === 'post')).toHaveLength(2 * n)
      expect(both.filter((p) => p.kind === 'rail')).toHaveLength(2)
    })

    it('the continuous rail is tilted up the flight rake (no per-step gaps)', () => {
      const rail = buildStaircase({ ...base, railing: 'side' }).find((p) => p.kind === 'rail')!
      // A Z-running straight flight tilts about X (pitch), not flat.
      expect(Math.abs(rail.pitch ?? 0)).toBeGreaterThan(0)
      expect(rail.roll ?? 0).toBe(0)
      // The rail is long enough to span the whole run (its Z extent ≥ the run).
      expect(rail.size[2]).toBeGreaterThanOrEqual(base.steps * base.treadDepth)
    })

    it("an L-shape's second (X-running) flight tilts its rail about Z (roll)", () => {
      const rails = buildStaircase({ ...base, style: 'lshape', railing: 'side' }).filter(
        (p) => p.kind === 'rail',
      )
      // Two flights → two continuous rails; the turned flight uses roll, not pitch.
      expect(rails).toHaveLength(2)
      expect(rails.some((r) => Math.abs(r.roll ?? 0) > 0)).toBe(true)
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

    it('the second flight turns 90° — its treads run along X while the first flight runs along Z', () => {
      const t = treads(buildStaircase({ ...base, style: 'lshape' }))
      // Flight 1 climbs +Z at x≈0; flight 2 climbs +X off the landing (x>0).
      const flight1 = t.filter((p) => Math.abs(p.position[0]) < 1e-6)
      const flight2 = t.filter((p) => p.position[0] > 1e-6)
      expect(flight1.length).toBeGreaterThan(0)
      expect(flight2.length).toBeGreaterThan(0)
      // Flight 1 treads are wide in X (full stair width), deep-along-Z; flight 2
      // is the mirror (deep-along-X, wide in Z) — the turn is expressed by the
      // swapped box dimensions, not a per-part Y rotation (which stays 0).
      expect(flight1[0].size[0]).toBeGreaterThan(flight1[0].size[2])
      expect(flight2[0].size[2]).toBeGreaterThan(flight2[0].size[0])
      expect(t.every((p) => (p.rot ?? 0) === 0)).toBe(true)
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

/** Is point (x, z) inside any footprint box (parts are axis-aligned)? */
const inParts = (
  parts: ReturnType<typeof staircaseFootprintParts>,
  x: number,
  z: number,
  tol = 1e-6,
) => parts.some((p) => Math.abs(x - p.dx) <= p.w / 2 + tol && Math.abs(z - p.dz) <= p.d / 2 + tol)

describe('staircaseFootprintParts', () => {
  it('straight: one centred box whose depth is the true run (tracks step count)', () => {
    const p13 = staircaseFootprintParts({ ...base, steps: 13 })
    expect(p13).toHaveLength(1)
    expect(p13[0]!.dx).toBeCloseTo(0)
    expect(p13[0]!.dz).toBeCloseTo(0)
    expect(p13[0]!.w).toBeCloseTo(0.9)
    expect(p13[0]!.d).toBeCloseTo(13 * 0.26)
    // A longer flight is honestly deeper — not pinned to the default bbox.
    const p24 = staircaseFootprintParts({ ...base, steps: 24 })
    expect(p24[0]!.d).toBeGreaterThan(p13[0]!.d)
    expect(p24[0]!.d).toBeCloseTo(24 * 0.26)
  })

  it('L-shape: three boxes with the second flight offset in +X (an L, not a full box)', () => {
    const parts = staircaseFootprintParts({ ...base, style: 'lshape' })
    expect(parts).toHaveLength(3)
    // First flight centred on X, second flight pushed out into +X.
    expect(parts[0]!.dx).toBeCloseTo(0)
    expect(parts[2]!.dx).toBeGreaterThan(base.width / 2)
    // The open corner (−X, far +Z) is NOT covered — a piece can sit in the L.
    expect(inParts(parts, -1.5, 3)).toBe(false)
  })

  it('U-shape: three boxes (two parallel flights + a wide half-landing)', () => {
    const parts = staircaseFootprintParts({ ...base, style: 'ushape' })
    expect(parts).toHaveLength(3)
    // The landing is the widest box (spans both flights).
    const widest = parts.reduce((a, b) => (b.w > a.w ? b : a))
    expect(widest.w).toBeCloseTo(base.width * 2)
  })

  it('spiral: one centred square enclosing the tread disc', () => {
    const parts = staircaseFootprintParts({ ...base, style: 'spiral' })
    expect(parts).toHaveLength(1)
    expect(parts[0]!.dx).toBeCloseTo(0)
    expect(parts[0]!.dz).toBeCloseTo(0)
    expect(parts[0]!.w).toBeGreaterThanOrEqual(2 * base.width)
  })

  it('honesty: every rendered tread centre lies within the footprint (no float outside)', () => {
    for (const style of ['straight', 'lshape', 'ushape'] as const) {
      const spec = { ...base, style }
      const parts = staircaseFootprintParts(spec)
      for (const t of treads(buildStaircase(spec))) {
        expect(inParts(parts, t.position[0], t.position[2], 1e-3)).toBe(true)
      }
    }
  })
})

describe('staircaseInstanceBuckets', () => {
  it('partitions parts: risers, metal (post/rail/newel), and mesh treads+landings', () => {
    // U-shape with both-side rails exercises every kind (incl. landings + rake rails).
    const spec: StaircaseSpec = { ...base, style: 'ushape', railing: 'both' }
    const parts = buildStaircase(spec)
    const { risers, metal, meshParts } = staircaseInstanceBuckets(parts)
    expect(risers).toHaveLength(parts.filter((p) => p.kind === 'riser').length)
    expect(metal).toHaveLength(
      parts.filter((p) => p.kind === 'post' || p.kind === 'rail' || p.kind === 'newel').length,
    )
    expect(meshParts).toHaveLength(
      parts.filter((p) => p.kind === 'tread' || p.kind === 'landing').length,
    )
    // Every part is accounted for exactly once.
    expect(risers.length + metal.length + meshParts.length).toBe(parts.length)
  })

  it('AE=0: each instanced riser/metal matrix equals the old per-mesh box transform', () => {
    // Include a spiral (rot on every part) + straight both-side rails (rake pitch)
    // so the pitch/rot/roll → T·R·S baking is covered across styles.
    for (const style of ['straight', 'spiral', 'lshape', 'ushape'] as const) {
      const spec: StaircaseSpec = { ...base, style, railing: 'both' }
      const parts = buildStaircase(spec)
      const instanced = parts.filter((p) => p.kind !== 'tread' && p.kind !== 'landing')
      const { risers, metal } = staircaseInstanceBuckets(parts)
      const all = [...risers, ...metal]
      expect(all).toHaveLength(instanced.length)
      for (const p of instanced) {
        // Old path: a real-sized box at position, rotated [pitch, rot, roll].
        const dummy = new Object3D()
        dummy.position.set(...p.position)
        dummy.rotation.set(p.pitch ?? 0, p.rot ?? 0, p.roll ?? 0)
        dummy.updateMatrix()
        const old = new BoxGeometry(p.size[0], p.size[1], p.size[2])
        old.applyMatrix4(dummy.matrix)
        // New path: unit box baked by the instance matrix.
        const inst = {
          position: p.position,
          size: p.size,
          rotation: [p.pitch ?? 0, p.rot ?? 0, p.roll ?? 0] as [number, number, number],
        }
        const unit = new BoxGeometry(1, 1, 1)
        unit.applyMatrix4(bakeInstanceMatrix(inst, new Object3D()))
        const a = old.getAttribute('position').array
        const b = unit.getAttribute('position').array
        let err = 0
        for (let i = 0; i < a.length; i++) err = Math.max(err, Math.abs(a[i] - b[i]))
        expect(err).toBeLessThan(1e-6)
      }
    }
  })
})
