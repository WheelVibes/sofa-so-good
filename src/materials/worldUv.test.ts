import type { BufferGeometry } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../features/featureFlags'
import { useStore } from '../state/store'
import {
  applyUvTransform,
  breakRepetitionPlane,
  breakRepetitionShape,
  cellUvTransform,
  clipPolygonToRect,
  worldUvPlaneGeometry,
  worldUvShapeGeometry,
} from './worldUv'

const square: [number, number][] = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
]

function uvExtent(geo: BufferGeometry) {
  const uv = geo.attributes.uv
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < uv.count; i++) {
    min = Math.min(min, uv.getX(i))
    max = Math.max(max, uv.getX(i))
  }
  return max - min
}

function uvArray(geo: BufferGeometry): number[] {
  const uv = geo.attributes.uv
  const out: number[] = []
  for (let i = 0; i < uv.count; i++) {
    out.push(uv.getX(i), uv.getY(i))
  }
  return out
}

function hasNaN(geo: BufferGeometry): boolean {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.array.length; i++) {
    if (!Number.isFinite(uv.array[i])) return true
  }
  return false
}

describe('applyUvTransform / worldUvShapeGeometry', () => {
  it('is identity (UVs unchanged) with no transform', () => {
    const geo = worldUvShapeGeometry(square)
    expect(uvExtent(geo)).toBeCloseTo(2, 6) // world-metre UVs span the 2 m square
  })

  it('scaling tile size by 2 halves the UV extent (fewer repeats → bigger tiles)', () => {
    const geo = worldUvShapeGeometry(square, { scale: 2 })
    expect(uvExtent(geo)).toBeCloseTo(1, 6)
  })

  it('a 90° rotation preserves the extent (rotation about the UV centre)', () => {
    const geo = worldUvShapeGeometry(square, { angle: Math.PI / 2 })
    expect(uvExtent(geo)).toBeCloseTo(2, 6)
  })

  it('applyUvTransform is a no-op for the identity transform', () => {
    const a = worldUvShapeGeometry(square)
    const before = uvExtent(a)
    applyUvTransform(a, { scale: 1, angle: 0 })
    expect(uvExtent(a)).toBeCloseTo(before, 6)
  })
})

describe('cellUvTransform (RD-406 per-cell hash)', () => {
  it('is deterministic — same cell yields identical output across calls', () => {
    expect(cellUvTransform(3, 7)).toEqual(cellUvTransform(3, 7))
    expect(cellUvTransform(-12, 40)).toEqual(cellUvTransform(-12, 40))
  })

  it('breaks the period — adjacent cells differ in rotation and/or offset', () => {
    // Over a strip of adjacent cells the transform must vary (not constant), or
    // the grid would still read as the same tile every metre.
    const seq = Array.from({ length: 12 }, (_, i) => cellUvTransform(i, 0))
    let adjacentDiffs = 0
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1]
      const b = seq[i]
      if (a.quarters !== b.quarters || a.offU !== b.offU || a.offV !== b.offV) adjacentDiffs++
    }
    // Effectively every neighbour should differ; require a strong majority.
    expect(adjacentDiffs).toBeGreaterThan(seq.length - 3)
    // And rotations are not all the same across the strip.
    const rotations = new Set(seq.map((t) => t.quarters))
    expect(rotations.size).toBeGreaterThan(1)
  })

  it('stays in range — quarters 0..3, offsets [0,1), never NaN', () => {
    for (let u = -5; u <= 5; u++) {
      for (let v = -5; v <= 5; v++) {
        const t = cellUvTransform(u, v)
        expect([0, 1, 2, 3]).toContain(t.quarters)
        expect(t.offU).toBeGreaterThanOrEqual(0)
        expect(t.offU).toBeLessThan(1)
        expect(t.offV).toBeGreaterThanOrEqual(0)
        expect(t.offV).toBeLessThan(1)
        expect(Number.isFinite(t.offU)).toBe(true)
        expect(Number.isFinite(t.offV)).toBe(true)
      }
    }
  })
})

describe('breakRepetitionPlane (RD-406 repetition break-up)', () => {
  it('subdivides a multi-tile floor and produces no UV NaN/inf', () => {
    const geo = breakRepetitionPlane(6, 6, 2) // 3×3 tiles
    expect(geo).not.toBeNull()
    expect(hasNaN(geo!)).toBe(false)
    // 9 cells × 4 verts.
    expect(geo!.attributes.uv.count).toBe(9 * 4)
  })

  it('is byte-identical across re-runs (pure + deterministic)', () => {
    const a = breakRepetitionPlane(6, 4, 2)
    const b = breakRepetitionPlane(6, 4, 2)
    expect(a).not.toBeNull()
    expect(uvArray(a!)).toEqual(uvArray(b!))
  })

  it('keeps the metre UV scale: total UV extent ≈ the surface size', () => {
    // The break-up only re-phases/rotates within tiles, so the surface still
    // shows the same number of tile repeats overall (the physical scale holds).
    const geo = breakRepetitionPlane(6, 6, 2)!
    // Extent grows by at most ~1 tile from the sub-tile offsets — never explodes.
    expect(uvExtent(geo)).toBeGreaterThan(5)
    expect(uvExtent(geo)).toBeLessThan(8)
  })

  it('breaks the visible period — not every cell shares the unbroken UV origin', () => {
    // A plain (unbroken) plane would have each cell start at an integer multiple
    // of tileSize. After break-up the per-cell UV phase varies cell-to-cell.
    const geo = breakRepetitionPlane(8, 2, 2)! // 4×1 tiles
    const uv = geo.attributes.uv
    // First corner U of each of the 4 cells (vertex 0 of each 4-vert quad).
    const firstCornerU = [0, 4, 8, 12].map((vi) => uv.getX(vi))
    const fracs = firstCornerU.map((u) => ((u % 2) + 2) % 2)
    const distinct = new Set(fracs.map((f) => Math.round(f * 256)))
    expect(distinct.size).toBeGreaterThan(1)
  })

  it('leaves a repeat≈1 / sub-tile surface untouched (returns null → plain plane)', () => {
    expect(breakRepetitionPlane(2, 2, 2)).toBeNull() // exactly 1×1 tile
    expect(breakRepetitionPlane(1.5, 1.5, 2)).toBeNull() // smaller than a tile
  })

  it('guards degenerate geometry (non-positive size / tile, non-finite)', () => {
    expect(breakRepetitionPlane(0, 6, 2)).toBeNull()
    expect(breakRepetitionPlane(6, -1, 2)).toBeNull()
    expect(breakRepetitionPlane(6, 6, 0)).toBeNull()
    expect(breakRepetitionPlane(6, 6, Number.NaN)).toBeNull()
    expect(breakRepetitionPlane(6, 6, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('guards a runaway subdivision (huge floor + tiny tile) → null', () => {
    // 1000 × 1000 cells would be > 4096 quads — fall back to the plain plane.
    expect(breakRepetitionPlane(1000, 1000, 1)).toBeNull()
  })
})

describe('worldUvPlaneGeometry break-up wiring', () => {
  it('no breakup arg → plain plane (byte-identical to the pre-break-up path)', () => {
    const plain = worldUvPlaneGeometry(6, 6)
    // A plain plane has the default 4-vertex quad (no subdivision).
    expect(plain.attributes.uv.count).toBe(4)
  })

  it('breakup arg on a multi-tile floor → subdivided, broken UVs', () => {
    const broken = worldUvPlaneGeometry(6, 6, undefined, 2)
    expect(broken.attributes.uv.count).toBe(9 * 4)
    expect(hasNaN(broken)).toBe(false)
  })

  it('breakup arg on a sub-tile floor → falls back to the plain plane', () => {
    const small = worldUvPlaneGeometry(2, 2, undefined, 2)
    expect(small.attributes.uv.count).toBe(4)
  })
})

describe('tileBreakup flag gating (Simple vs Pro) — the build-site guard', () => {
  beforeEach(() => {
    useStore.getState().setUiMode('pro')
    useStore.getState().resetFeatureFlags()
  })

  // Mirror the floor build-site expression: a tiling finish passes a tile size,
  // and the break-up only kicks in when the flag is enabled.
  const buildSiteBreakup = (tileSize?: number) =>
    tileSize != null && isFeatureEnabled('tileBreakup') ? tileSize : undefined

  it('is a pro feature: ON in Pro mode, OFF (forced) in Simple mode', () => {
    useStore.getState().setUiMode('pro')
    expect(useStore.getState().featureFlags.tileBreakup).toBe(true)
    expect(isFeatureEnabled('tileBreakup')).toBe(true)

    useStore.getState().setUiMode('simple')
    expect(useStore.getState().featureFlags.tileBreakup).toBe(false)
    expect(isFeatureEnabled('tileBreakup')).toBe(false)
  })

  it('Pro mode → a tiled floor breaks up (subdivided geometry)', () => {
    useStore.getState().setUiMode('pro')
    const breakup = buildSiteBreakup(2)
    const geo = worldUvPlaneGeometry(6, 6, undefined, breakup)
    expect(geo.attributes.uv.count).toBe(9 * 4) // subdivided
  })

  it('Simple mode → a tiled floor stays the plain plane (byte-identical to today)', () => {
    useStore.getState().setUiMode('simple')
    const breakup = buildSiteBreakup(2)
    expect(breakup).toBeUndefined()
    const geo = worldUvPlaneGeometry(6, 6, undefined, breakup)
    expect(geo.attributes.uv.count).toBe(4) // plain quad
  })
})

// An L-shaped room (the case rect break-up could never cover): 6×6 with a
// 3×3 bite out of the far corner.
const lShape: [number, number][] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3, 3],
  [3, 6],
  [0, 6],
]

/** Summed triangle area of an indexed geometry, in shape space. */
function geoArea(geo: BufferGeometry): number {
  const pos = geo.attributes.position
  const idx = geo.getIndex()!
  let a = 0
  for (let i = 0; i < idx.count; i += 3) {
    const [i0, i1, i2] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)]
    const ax = pos.getX(i1) - pos.getX(i0)
    const ay = pos.getY(i1) - pos.getY(i0)
    const bx = pos.getX(i2) - pos.getX(i0)
    const by = pos.getY(i2) - pos.getY(i0)
    a += Math.abs(ax * by - ay * bx) / 2
  }
  return a
}

describe('clipPolygonToRect (Sutherland–Hodgman cell clip)', () => {
  const unit: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ]

  it('returns the cell itself when the cell is fully inside', () => {
    const c = clipPolygonToRect(unit, 1, 1, 2, 2)
    expect(c).toHaveLength(4)
    for (const [x, y] of c) {
      expect(x).toBeGreaterThanOrEqual(1)
      expect(x).toBeLessThanOrEqual(2)
      expect(y).toBeGreaterThanOrEqual(1)
      expect(y).toBeLessThanOrEqual(2)
    }
  })

  it('returns nothing for a cell that misses the polygon', () => {
    expect(clipPolygonToRect(unit, 10, 10, 11, 11)).toEqual([])
  })

  it('clips a partly-covered cell to the overlap', () => {
    // Half in, half out: only the x ≤ 4 part survives.
    const c = clipPolygonToRect(unit, 3, 0, 5, 1)
    expect(c.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...c.map(([x]) => x))).toBeCloseTo(4, 6)
  })
})

describe('breakRepetitionShape (RD-406 for irregular rooms)', () => {
  it('breaks up an L-shaped room — the case the rect path cannot reach', () => {
    const geo = breakRepetitionShape(lShape, 1.5)
    expect(geo).not.toBeNull()
    expect(hasNaN(geo!)).toBe(false)
  })

  it('covers exactly the room — no gaps, no overlap outside the polygon', () => {
    // L area = 6×6 − 3×3 = 27 m².
    const geo = breakRepetitionShape(lShape, 1.5)!
    expect(geoArea(geo)).toBeCloseTo(27, 4)
  })

  it('is byte-identical across re-runs (pure + deterministic)', () => {
    const a = breakRepetitionShape(lShape, 1.5)!
    const b = breakRepetitionShape(lShape, 1.5)!
    expect(uvArray(a)).toEqual(uvArray(b))
  })

  it('breaks the visible period: cells do not all share one UV phase', () => {
    const geo = breakRepetitionShape(lShape, 1.5)!
    const uv = geo.attributes.uv
    const phases = new Set<number>()
    for (let i = 0; i < uv.count; i++) {
      phases.add(Math.round(((((uv.getX(i) / 1.5) % 1) + 1) % 1) * 64))
    }
    expect(phases.size).toBeGreaterThan(1)
  })

  it('keeps the metre UV scale — UV never drifts more than the transform allows', () => {
    // The per-cell transform only rotates within the tile and adds a ≤ half-tile
    // offset, so |uv − world| ≤ 1.5 tiles. Anything beyond that would mean the
    // physical texture scale drifted across the room.
    const geo = breakRepetitionShape(lShape, 1.5)!
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const bound = 1.5 * 1.5 + 1e-6
    for (let i = 0; i < uv.count; i++) {
      // shape space y = -z, and V is in world z.
      expect(Math.abs(uv.getX(i) - pos.getX(i))).toBeLessThanOrEqual(bound)
      expect(Math.abs(uv.getY(i) + pos.getY(i))).toBeLessThanOrEqual(bound)
    }
  })

  it('anchors cells to the WORLD grid, so two rooms agree on a shared cell', () => {
    // The phase is a function of world position, not of the room's own bounds —
    // otherwise two rooms meeting at a doorway would each re-seed the pattern
    // and the tiles would visibly jump across the threshold.
    const cellUvs = (poly: [number, number][]) => {
      const geo = breakRepetitionShape(poly, 1.5)!
      const pos = geo.attributes.position
      const uv = geo.attributes.uv
      const out: string[] = []
      for (let i = 0; i < uv.count; i++) {
        const x = pos.getX(i)
        const z = -pos.getY(i)
        // Vertices of the cell spanning world [1.5, 3] × [1.5, 3].
        if (x >= 1.5 - 1e-9 && x <= 3 + 1e-9 && z >= 1.5 - 1e-9 && z <= 3 + 1e-9) {
          out.push(
            `${x.toFixed(4)},${z.toFixed(4)}→${uv.getX(i).toFixed(4)},${uv.getY(i).toFixed(4)}`,
          )
        }
      }
      return [...new Set(out)].sort()
    }
    const bigSquare: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]
    expect(cellUvs(lShape)).toEqual(cellUvs(bigSquare))
  })

  it('guards degenerate input (thin/■ polygon, bad tile, runaway cell count)', () => {
    expect(
      breakRepetitionShape(
        [
          [0, 0],
          [1, 0],
        ] as [number, number][],
        1,
      ),
    ).toBeNull()
    expect(breakRepetitionShape(lShape, 0)).toBeNull()
    expect(breakRepetitionShape(lShape, Number.NaN)).toBeNull()
    // One cell in each axis → no neighbour to mis-align against.
    expect(breakRepetitionShape(square, 4)).toBeNull()
    // 6 m room at a 1 mm tile would be 36 million cells.
    expect(breakRepetitionShape(lShape, 0.001)).toBeNull()
  })
})

describe('worldUvShapeGeometry break-up wiring', () => {
  it('no breakup arg → the plain unwrap (unchanged behaviour)', () => {
    const plain = worldUvShapeGeometry(lShape)
    expect(plain.attributes.uv.count).toBe(6)
  })

  it('breakup arg → per-cell broken UVs', () => {
    const broken = worldUvShapeGeometry(lShape, undefined, 1.5)
    expect(broken.attributes.uv.count).toBeGreaterThan(6)
    expect(hasNaN(broken)).toBe(false)
  })

  it('falls back to the plain unwrap when the room is under two cells', () => {
    expect(worldUvShapeGeometry(square, undefined, 4).attributes.uv.count).toBe(4)
  })
})

describe('direction-preserving break-up (quarterTurns=false)', () => {
  it('only ever turns a cell 180°, so a plank keeps its run', () => {
    for (let cu = -6; cu < 6; cu++) {
      for (let cv = -6; cv < 6; cv++) {
        expect([0, 2]).toContain(cellUvTransform(cu, cv, false).quarters)
      }
    }
  })

  it('still varies cell to cell (both 0° and 180° appear)', () => {
    const seen = new Set<number>()
    for (let cu = 0; cu < 8; cu++) {
      for (let cv = 0; cv < 8; cv++) seen.add(cellUvTransform(cu, cv, false).quarters)
    }
    expect([...seen].sort()).toEqual([0, 2])
  })

  it('keeps the sub-tile stagger — the part of a plank floor that DOES vary', () => {
    const offs = new Set<string>()
    for (let cu = 0; cu < 8; cu++) {
      for (let cv = 0; cv < 8; cv++) {
        const t = cellUvTransform(cu, cv, false)
        offs.add(`${t.offU},${t.offV}`)
      }
    }
    expect(offs.size).toBeGreaterThan(1)
  })

  it('leaves U running along world X on every cell of a rect floor', () => {
    // A 90°/270° turn would swap the axes — the patchwork a wood floor must
    // never show. Walk each cell's bottom edge: U must change, V must not.
    const geo = breakRepetitionPlane(8, 8, 2, false)!
    const uv = geo.attributes.uv
    for (let cell = 0; cell < uv.count / 4; cell++) {
      const i = cell * 4 // corners: (0,0) (1,0) (1,1) (0,1) in tile fractions
      expect(Math.abs(uv.getX(i + 1) - uv.getX(i))).toBeCloseTo(2, 6)
      expect(Math.abs(uv.getY(i + 1) - uv.getY(i))).toBeCloseTo(0, 6)
    }
  })

  it('quarterTurns=true (isotropic finishes) still rotates — unchanged behaviour', () => {
    const quarters = new Set<number>()
    for (let cu = 0; cu < 8; cu++) {
      for (let cv = 0; cv < 8; cv++) quarters.add(cellUvTransform(cu, cv).quarters)
    }
    expect(quarters.size).toBeGreaterThan(2)
  })

  it('applies to irregular rooms too — the polygon path takes the same flag', () => {
    const geo = breakRepetitionShape(lShape, 1.5, false)!
    expect(hasNaN(geo)).toBe(false)
    // Cell-corner UVs must still be axis-aligned with world X/Z (no swap).
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) {
      // With no quarter turn, u tracks world x and v tracks world z (± offset).
      expect(Math.abs(uv.getX(i) - pos.getX(i))).toBeLessThanOrEqual(1.5 * 1.5 + 1e-6)
    }
  })
})

describe('cells anchor to the texture period (the mis-joined bathroom tiles)', () => {
  /** Per-cell world extent vs UV extent, and where each cell's UV starts. */
  const cells = (geo: BufferGeometry) => {
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const out: { w: number; h: number; u: number; v: number; u0: number; v0: number }[] = []
    for (let c = 0; c < uv.count / 4; c++) {
      const i = c * 4
      const xs = [0, 1, 2, 3].map((k) => pos.getX(i + k))
      const ys = [0, 1, 2, 3].map((k) => pos.getY(i + k))
      const us = [0, 1, 2, 3].map((k) => uv.getX(i + k))
      const vs = [0, 1, 2, 3].map((k) => uv.getY(i + k))
      out.push({
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        u: Math.max(...us) - Math.min(...us),
        v: Math.max(...vs) - Math.min(...vs),
        u0: Math.min(...us),
        v0: Math.min(...vs),
      })
    }
    return out
  }

  it('never squeezes a texture period into a smaller cell (Bath/WC 2: 1.75 × 1.85 m, 1.2 m tile)', () => {
    // The reported bug: `round(size / tile)` equal cells gave a 1.75 × 0.925 m
    // cell showing 1.2 × 1.2 of UV — the tiles came out a different SIZE in
    // each band, with grout that could not meet. Every cell must map its own
    // world extent 1:1 into UV metres.
    for (const c of cells(breakRepetitionPlane(1.75, 1.85, 1.2, false)!)) {
      // A quarter turn would swap the pair; this finish is directional anyway.
      expect(c.u).toBeCloseTo(c.w, 5)
      expect(c.v).toBeCloseTo(c.h, 5)
    }
  })

  /**
   * Each cell's world→UV mapping, in the plane's own UV frame (X = x + w/2).
   * The contract is that it is a LATTICE SYMMETRY of the texture: a signed axis
   * permutation (rotation/flip, unit scale — no stretch, no shear) plus a
   * translation that is a whole number of half-periods. Any map of that form
   * carries a wrapping texture's internal grid onto itself, which is what lets
   * grout lines meet across a cell boundary; the raw UV of a corner does not
   * say that (a 180° cell starts mid-tile while its tile ORIGIN stays put).
   */
  const cellMap = (geo: BufferGeometry, w: number, h: number, i: number) => {
    const pos = geo.attributes.position
    const uv = geo.attributes.uv
    const X = (k: number) => pos.getX(i + k) + w / 2
    const Y = (k: number) => pos.getY(i + k) + h / 2
    // Corners are emitted (x0,y0) (x1,y0) (x1,y1) (x0,y1).
    const dX = X(1) - X(0)
    const dY = Y(3) - Y(0)
    return {
      a: (uv.getX(i + 1) - uv.getX(i)) / dX, // ∂u/∂X
      b: (uv.getX(i + 3) - uv.getX(i)) / dY, // ∂u/∂Y
      c: (uv.getY(i + 1) - uv.getY(i)) / dX, // ∂v/∂X
      d: (uv.getY(i + 3) - uv.getY(i)) / dY, // ∂v/∂Y
      tu:
        uv.getX(i) -
        ((uv.getX(i + 1) - uv.getX(i)) / dX) * X(0) -
        ((uv.getX(i + 3) - uv.getX(i)) / dY) * Y(0),
      tv:
        uv.getY(i) -
        ((uv.getY(i + 1) - uv.getY(i)) / dX) * X(0) -
        ((uv.getY(i + 3) - uv.getY(i)) / dY) * Y(0),
    }
  }

  it('maps every cell by a texture-lattice symmetry, so grout lines can meet', () => {
    const tile = 1.2
    const geo = breakRepetitionPlane(1.75, 1.85, tile)!
    const half = tile / 2
    const onLattice = (t: number) => {
      const p = (((t / half) % 1) + 1) % 1
      return Math.min(p, 1 - p)
    }
    for (let cell = 0; cell < geo.attributes.uv.count / 4; cell++) {
      const m = cellMap(geo, 1.75, 1.85, cell * 4)
      // Unit-scale axis permutation: no stretch (the reported bug), no shear.
      for (const v of [m.a, m.b, m.c, m.d]) expect([-1, 0, 1]).toContain(Math.round(v))
      for (const v of [m.a, m.b, m.c, m.d]) expect(Math.abs(v - Math.round(v))).toBeLessThan(1e-5)
      expect(Math.abs(Math.abs(m.a * m.d - m.b * m.c) - 1)).toBeLessThan(1e-5)
      // Translation lands on the half-period lattice.
      expect(onLattice(m.tu)).toBeLessThan(1e-5)
      expect(onLattice(m.tv)).toBeLessThan(1e-5)
    }
  })

  it('clips the last cell instead of stretching it — and covers the surface exactly', () => {
    const geo = breakRepetitionPlane(1.75, 1.85, 1.2, false)!
    const cs = cells(geo)
    expect(cs).toHaveLength(4) // ceil(1.75/1.2) × ceil(1.85/1.2)
    expect(Math.max(...cs.map((c) => c.w))).toBeCloseTo(1.2, 5)
    expect(Math.min(...cs.map((c) => c.w))).toBeCloseTo(0.55, 5)
    // Summed cell area == floor area: no gap, no overlap.
    const area = cs.reduce((a, c) => a + c.w * c.h, 0)
    expect(area).toBeCloseTo(1.75 * 1.85, 5)
  })

  it('is unchanged on a floor that IS a whole number of tiles', () => {
    for (const c of cells(breakRepetitionPlane(6, 6, 2, false)!)) {
      expect(c.w).toBeCloseTo(2, 6)
      expect(c.u).toBeCloseTo(2, 6)
    }
  })

  it('holds for a range of real room sizes', () => {
    for (const [w, h, t] of [
      [3.03, 3.525, 1.2],
      [4.2, 3.1, 0.8],
      [2.4, 5.6, 0.6],
    ] as [number, number, number][]) {
      const geo = breakRepetitionPlane(w, h, t, false)
      if (!geo) continue
      for (const c of cells(geo)) {
        expect(c.u).toBeCloseTo(c.w, 4)
        expect(c.v).toBeCloseTo(c.h, 4)
      }
    }
  })
})
