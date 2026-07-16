import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { partGeometry } from './buildObject'
import { type ShapePart, taperable } from './editSpec'
import { bevelledBoxGeometry, extrudeGeometry } from './shapeProfiles'
import { applyTaper } from './taper'

/** Max |coordinate| on `axis` among vertices whose `along` coord is within `eps`
 *  of `target` — i.e. the half-extent of one end face. */
function halfExtentAt(
  geo: {
    getAttribute: (n: string) => {
      count: number
      getX: (i: number) => number
      getY: (i: number) => number
      getZ: (i: number) => number
    }
  },
  along: 'x' | 'y' | 'z',
  target: number,
  measure: 'x' | 'y' | 'z',
  eps = 1e-3,
): number {
  const pos = geo.getAttribute('position')
  const get = (i: number, a: 'x' | 'y' | 'z') =>
    a === 'x' ? pos.getX(i) : a === 'y' ? pos.getY(i) : pos.getZ(i)
  let m = 0
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(get(i, along) - target) <= eps) m = Math.max(m, Math.abs(get(i, measure)))
  }
  return m
}

function normalsFinite(geo: {
  getAttribute: (n: string) => { count: number; array: ArrayLike<number> }
}): boolean {
  const n = geo.getAttribute('normal')
  for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) return false
  return true
}

describe('applyTaper — box (Y axis)', () => {
  it('shrinks the +Y top face to (1 − taper) × the bottom face', () => {
    const geo = new BoxGeometry(1, 2, 1)
    applyTaper(geo, 0.4, 'y')
    const bottom = halfExtentAt(geo, 'y', -1, 'x') // full
    const top = halfExtentAt(geo, 'y', 1, 'x') // shrunk
    expect(bottom).toBeCloseTo(0.5, 5)
    expect(top).toBeCloseTo(0.5 * (1 - 0.4), 5)
    // Same shrink on Z (symmetric shrink toward the footprint centroid).
    expect(halfExtentAt(geo, 'y', 1, 'z')).toBeCloseTo(0.5 * 0.6, 5)
  })

  it('recomputes finite normals and keeps UVs intact', () => {
    const geo = new BoxGeometry(1, 1, 1)
    expect(geo.getAttribute('uv')).toBeTruthy()
    applyTaper(geo, 0.5, 'y')
    expect(normalsFinite(geo)).toBe(true)
    const uv = geo.getAttribute('uv')
    expect(uv).toBeTruthy()
    for (let i = 0; i < uv.array.length; i++) expect(Number.isFinite(uv.array[i])).toBe(true)
  })

  it('is a no-op at taper 0', () => {
    const geo = new BoxGeometry(1, 2, 1)
    applyTaper(geo, 0, 'y')
    expect(halfExtentAt(geo, 'y', 1, 'x')).toBeCloseTo(0.5, 5)
  })

  it('composes with a bevel (rounded tapered box) — top shrinks, normals finite', () => {
    const geo = bevelledBoxGeometry(1, 2, 1, 0.1)
    const bottomBefore = halfExtentAt(geo, 'y', -1, 'x')
    applyTaper(geo, 0.4, 'y')
    // Rounded corners inset the true extent slightly; the ratio still tracks 0.6.
    const top = halfExtentAt(geo, 'y', 1 - 0.1, 'x') // top ring sits just below +h/2
    expect(top).toBeLessThan(bottomBefore)
    expect(normalsFinite(geo)).toBe(true)
  })
})

describe('applyTaper — extrude (Z / depth axis)', () => {
  it('shrinks the +Z front cross-section along the extrude axis', () => {
    // Sharp extrude (bevel 0) so the end caps sit exactly at ±d/2.
    const geo = extrudeGeometry(
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ],
      1,
      1,
      1,
      0,
    )
    geo.computeBoundingBox()
    const zMax = geo.boundingBox?.max.z ?? 0.5
    const zMin = geo.boundingBox?.min.z ?? -0.5
    const back = halfExtentAt(geo, 'z', zMin, 'x')
    applyTaper(geo, 0.5, 'z')
    const front = halfExtentAt(geo, 'z', zMax, 'x')
    expect(front).toBeCloseTo(back * 0.5, 4)
    expect(normalsFinite(geo)).toBe(true)
  })
})

describe('taperable gate', () => {
  const base: ShapePart = {
    id: 'p',
    kind: 'box',
    position: [0, 0, 0],
    size: [1, 1, 1],
    color: '#fff',
  }
  it('allows a solid box + extrude', () => {
    expect(taperable(base)).toBe(true)
    expect(taperable({ ...base, kind: 'extrude' })).toBe(true)
  })
  it('composes with bevel + faceFinishes (still taperable)', () => {
    expect(taperable({ ...base, bevel: 0.05 })).toBe(true)
    expect(taperable({ ...base, faceFinishes: { top: { color: '#123456' } } })).toBe(true)
  })
  it('gates off a hollow / plumped / tufted box', () => {
    expect(taperable({ ...base, shell: 0.02 })).toBe(false)
    expect(taperable({ ...base, plump: 0.5 })).toBe(false)
    expect(taperable({ ...base, plump: 0.5, tuft: { rows: 2, cols: 2, depth: 0.5 } })).toBe(false)
  })
  it('gates off a hollow extrude and every non-box/extrude kind', () => {
    expect(taperable({ ...base, kind: 'extrude', shell: 0.02 })).toBe(false)
    for (const kind of ['cylinder', 'sphere', 'cone', 'wedge', 'lathe', 'loft'] as const) {
      expect(taperable({ ...base, kind })).toBe(false)
    }
  })
})

describe('partGeometry integration', () => {
  const base: ShapePart = {
    id: 'p',
    kind: 'box',
    position: [0, 0, 0],
    size: [1, 2, 1],
    color: '#fff',
  }

  it('tapers a plain box through the geometry switch', () => {
    const geo = partGeometry({ ...base, taper: 0.4 })
    expect(halfExtentAt(geo as never, 'y', 1, 'x')).toBeCloseTo(0.3, 4)
    expect(halfExtentAt(geo as never, 'y', -1, 'x')).toBeCloseTo(0.5, 4)
  })

  it('keeps a plain BoxGeometry (so per-face finishes still remap groups)', () => {
    const geo = partGeometry({ ...base, taper: 0.4, faceFinishes: { top: { color: '#abcdef' } } })
    expect(geo).toBeInstanceOf(BoxGeometry)
    // faceFinishes remap adds 6 groups on a sharp box.
    expect(geo.groups.length).toBe(6)
  })

  it('ignores taper on a shelled box (gated)', () => {
    const geo = partGeometry({ ...base, taper: 0.6, shell: 0.05 })
    // Shelled carcass keeps its full top footprint (taper not applied).
    expect(halfExtentAt(geo as never, 'y', 1, 'x')).toBeCloseTo(0.5, 2)
  })
})
