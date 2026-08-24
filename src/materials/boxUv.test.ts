import { BoxGeometry, type BufferGeometry, CylinderGeometry, Group, Mesh } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'
import { applyBoxUv, boxProjectSubtree, boxProjectUv, faceAxes } from './boxUv'

describe('faceAxes — which local axis carries U', () => {
  it('puts grain along a leg: a tall thin part maps U to its height', () => {
    // 4 cm × 70 cm × 5 cm leg, side face (x-dominant normal) → axes z (0.05)
    // and y (0.70): U must be y, or the grain runs across the leg.
    expect(faceAxes(0, [0.04, 0.7, 0.05])).toEqual([1, 2])
  })

  it('puts grain along a tabletop: the top face maps U to the long side', () => {
    // 1.6 m × 4 cm × 0.8 m top, y-dominant normal → axes x (1.6) and z (0.8).
    expect(faceAxes(1, [1.6, 0.04, 0.8])).toEqual([0, 2])
  })

  it('flips the pair when the second axis is the longer one', () => {
    // A top that is deeper than it is wide runs its grain front-to-back.
    expect(faceAxes(1, [0.6, 0.04, 1.4])).toEqual([2, 0])
  })

  it('keeps the triplanar axis order on a square face (no coin-flip)', () => {
    expect(faceAxes(0, [1, 1, 1])).toEqual([2, 1])
    expect(faceAxes(1, [1, 1, 1])).toEqual([0, 2])
    expect(faceAxes(2, [1, 1, 1])).toEqual([0, 1])
  })
})

describe('boxProjectUv', () => {
  /** Two vertices on a +Y face and two on a +X face of a 2 × 0.1 × 1 slab. */
  const positions = new Float32Array([-1, 0.05, -0.5, 1, 0.05, 0.5, 1, -0.05, -0.5, 1, 0.05, 0.5])
  const normals = new Float32Array([0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0])
  const size: [number, number, number] = [2, 0.1, 1]

  it('emits metre UVs — the tile period is physical, not per-face', () => {
    const uv = boxProjectUv(positions, normals, size)!
    // Top face (y-dominant): U = x, V = z, straight from the local position.
    expect([uv[0], uv[1]]).toEqual([-1, -0.5])
    expect([uv[2], uv[3]]).toEqual([1, 0.5])
    // A 2 m-wide top therefore spans 2 UV metres, where the default box UVs
    // would have spanned 1 regardless of size.
    expect(uv[2] - uv[0]).toBe(2)
  })

  it('projects a side face from its own axes (z, y) with U on the longer one', () => {
    const uv = boxProjectUv(positions, normals, size)!
    // x-dominant face of this slab: z (1.0) beats y (0.1), so U = z, V = y.
    expect(uv[4]).toBeCloseTo(-0.5, 6)
    expect(uv[5]).toBeCloseTo(-0.05, 6)
  })

  it('is pure — same input, byte-identical output', () => {
    const a = boxProjectUv(positions, normals, size)!
    const b = boxProjectUv(positions, normals, size)!
    expect([...a]).toEqual([...b])
  })

  it('rejects a malformed buffer rather than emitting NaN UVs', () => {
    expect(boxProjectUv(new Float32Array([0, 0, 0]), new Float32Array([0, 1]), size)).toBeNull()
    expect(boxProjectUv(new Float32Array(), new Float32Array(), size)).toBeNull()
  })

  it('never produces a non-finite UV', () => {
    const uv = boxProjectUv(positions, normals, size)!
    for (const n of uv) expect(Number.isFinite(n)).toBe(true)
  })
})

describe('applyBoxUv / boxProjectSubtree (three wiring)', () => {
  const uvSpan = (geo: BufferGeometry, axis: 0 | 1) => {
    const uv = geo.attributes.uv
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < uv.count; i++) {
      const v = axis === 0 ? uv.getX(i) : uv.getY(i)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    return max - min
  }

  it('rewrites a box to metre UVs — a 2 m top spans 2, not 1', () => {
    const geo = new BoxGeometry(2, 0.1, 1)
    // Default BoxGeometry UVs are 0..1 on every face regardless of size.
    expect(uvSpan(geo, 0)).toBe(1)
    expect(applyBoxUv(geo)).toBe(true)
    expect(uvSpan(geo, 0)).toBeCloseTo(2, 6)
  })

  it('is idempotent — a re-render never re-projects', () => {
    const geo = new BoxGeometry(1, 1, 1)
    expect(applyBoxUv(geo)).toBe(true)
    expect(applyBoxUv(geo)).toBe(false)
  })

  it('leaves round geometry alone — a cylinder keeps its own wrap', () => {
    const geo = new CylinderGeometry(0.2, 0.2, 0.5)
    const before = uvSpan(geo, 0)
    expect(applyBoxUv(geo)).toBe(false)
    expect(uvSpan(geo, 0)).toBe(before)
  })

  it('projects every projectable mesh under a group, once', () => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(1, 1, 1)))
    root.add(new Mesh(new BoxGeometry(2, 1, 1)))
    root.add(new Mesh(new CylinderGeometry(0.1, 0.1, 1)))
    expect(boxProjectSubtree(root)).toBe(2)
    expect(boxProjectSubtree(root)).toBe(0)
  })
})

describe('furnitureBoxUv flag gating (Simple vs Pro)', () => {
  beforeEach(() => {
    useStore.getState().setUiMode('pro')
    useStore.getState().resetFeatureFlags()
  })

  it('is a correctness fix, not a pro dial: ON in BOTH modes', () => {
    // Simple mode must not be left with furniture whose grain scales with the
    // part — unlike `tileBreakup`, this is not an advanced refinement.
    expect(isFeatureEnabled('furnitureBoxUv')).toBe(true)
    useStore.getState().setUiMode('simple')
    expect(isFeatureEnabled('furnitureBoxUv')).toBe(true)
    expect(useStore.getState().featureFlags.furnitureBoxUv).toBe(true)
  })
})
