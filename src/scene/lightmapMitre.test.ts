// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../apartment/types'
import {
  geometricCornerMiter,
  wallCornerJoin,
  wallThicknessMetres,
} from '../apartment/wallSegments'
import {
  extrudeWallBody,
  MITRE_END_ATTR,
  type WallMiter,
} from '../apartment/walls/wallBodyGeometry'
import { wallBodyOutlineFromSpans } from '../apartment/walls/wallBodyShape'
import { CUT_CAP_UV_SENTINEL, markMitreEndFaces } from './lightmapExterior'
import { computeMitreEndInheritUv } from './lightmapMitre'
import { computeBoxAtlasUv } from './lightmapUv'

/**
 * MITRE-END-INHERIT, tested against the SAME geometry `wallMitreJoints.test.ts` uses to prove the
 * two mitred walls at a corner cut one shared line: a real `ExtrudeGeometry` wall body, mitred
 * exactly as `wallCornerMiter` would mitre it, run through the SAME `computeBoxAtlasUv` +
 * `markMitreEndFaces` sequence `applyVisibilityLightmaps.ts` runs before this module's pass.
 */

const HEIGHT = 2.6

/** A wall body, mitred at its END exactly like `applyMiter` would, as local xyz + `uv1` +
 *  `mitreEnd` — the three inputs `applyVisibilityLightmaps.ts` hands this module. */
function mitredWallBody(length: number, thickness: number, miter: WallMiter) {
  const outline = wallBodyOutlineFromSpans([], -length / 2, length / 2, HEIGHT)
  const geo = extrudeWallBody(outline, thickness, undefined, miter)
  const pos = geo.getAttribute('position')
  const positions = new Float64Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    positions[i * 3] = pos.getX(i)
    positions[i * 3 + 1] = pos.getY(i)
    positions[i * 3 + 2] = pos.getZ(i)
  }
  const mitreEnd = geo.getAttribute(MITRE_END_ATTR).array as Float32Array
  const { uv, conflicts } = computeBoxAtlasUv({ positions, indices: null })
  expect(conflicts).toBe(0)
  const sentinelled = markMitreEndFaces(null, pos.count, mitreEnd, uv)
  return { positions, mitreEnd, uv, sentinelled, thickness }
}

/** Every vertex the mitred pass touched (sentinel'd), by index. */
function mitredVertices(mitreEnd: Float32Array): number[] {
  const out: number[] = []
  for (let i = 0; i < mitreEnd.length; i += 1) if (mitreEnd[i]) out.push(i)
  return out
}

const isSentinel = (uv: Float32Array, v: number) =>
  uv[v * 2] === CUT_CAP_UV_SENTINEL && uv[v * 2 + 1] === CUT_CAP_UV_SENTINEL

/** Both thickness-column slots occupied — the common case for an interior wall with a real
 *  finish on both faces. */
const BOTH_OCCUPIED: [number, number][] = [
  [2, 0],
  [2, 1],
]

describe('computeMitreEndInheritUv — L-corner, equal thickness (45°)', () => {
  // Mirrors wallMitreJoints.test.ts's "L at 90 degrees, equal thickness" arm: slope 1, abut =
  // half the neighbour's thickness.
  const THICKNESS = 0.1
  const miter: WallMiter = { endAt: 2.5 + THICKNESS / 2, endSlope: 1 }

  it('inherits a donor UV for every mitred vertex when both thickness rows are occupied', () => {
    const { positions, mitreEnd, uv, sentinelled } = mitredWallBody(5, THICKNESS, miter)
    expect(sentinelled.faces).toBeGreaterThan(0)
    const touched = mitredVertices(mitreEnd)
    expect(touched.length).toBeGreaterThan(0)
    for (const v of touched) expect(isSentinel(uv, v)).toBe(true)

    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    expect(result).toEqual({ inherited: touched.length, fallback: 0 })
    for (const v of touched) {
      expect(isSentinel(uv, v)).toBe(false)
      // Column 2 of 3 (thickness axis): u must fall in [2/3, 1].
      expect(uv[v * 2]).toBeGreaterThanOrEqual(2 / 3)
      expect(uv[v * 2]).toBeLessThanOrEqual(1)
      expect(uv[v * 2 + 1]).toBeGreaterThanOrEqual(0)
      expect(uv[v * 2 + 1]).toBeLessThanOrEqual(1)
      // Row is decided by the vertex's own Z sign — row 0 (v in [0, 0.5]) for z >= 0, row 1 for
      // z < 0, matching `computeBoxAtlasUv`'s own `axis = 2` row convention.
      const z = positions[v * 3 + 2]
      if (z >= 0) expect(uv[v * 2 + 1]).toBeLessThanOrEqual(0.5)
      else expect(uv[v * 2 + 1]).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('falls back to the sentinel when NEITHER thickness row is occupied', () => {
    const { positions, mitreEnd, uv } = mitredWallBody(5, THICKNESS, miter)
    const touched = mitredVertices(mitreEnd)
    const before = Float32Array.from(uv)
    // An EMPTY array means "no occupancy evidence supplied" (matches `computeBoxAtlasUv`'s own
    // `occupiedSlots?.length ? … : null` convention) and is treated as unrestricted, not as
    // "nothing is occupied" — so the real test of "no donor" is a NON-empty occupancy that simply
    // never mentions column 2 (the thickness axis) at all.
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, [
      [0, 0],
      [1, 0],
    ])
    expect(result).toEqual({ inherited: 0, fallback: touched.length })
    // Untouched — still exactly the sentinel `markMitreEndFaces` wrote.
    expect(Array.from(uv)).toEqual(Array.from(before))
    for (const v of touched) expect(isSentinel(uv, v)).toBe(true)
  })

  it('mirrors to the occupied row when only ONE thickness side has a bake (winding disagreement)', () => {
    const { positions, mitreEnd, uv } = mitredWallBody(5, THICKNESS, miter)
    const touched = mitredVertices(mitreEnd)
    // Only row 0 recorded as occupied.
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, [[2, 0]])
    expect(result).toEqual({ inherited: touched.length, fallback: 0 })
    for (const v of touched) {
      expect(isSentinel(uv, v)).toBe(false)
      // Every vertex — whichever Z side it started on — must land in row 0, since that is the
      // only occupied row.
      expect(uv[v * 2 + 1]).toBeLessThanOrEqual(0.5)
    }
  })

  // The atlas margin ALONE already insets a slot's raw [col/3, (col+1)/3] edges by
  // `LIGHTMAP_UV_MARGIN` (the default 0.04) — that is `computeBoxAtlasUv`'s own mechanism, not
  // this module's. So "one texel inside the slot" has to be measured against the MARGIN-inclusive
  // edge, not the raw column boundary.
  const MARGIN = 0.04
  const MARGIN_EDGE_HI = (2 + MARGIN + 1 * (1 - 2 * MARGIN)) / 3

  it('clamps the LONG side (which reaches the box`s own extreme) one texel inside the MARGIN edge', () => {
    const { positions, mitreEnd, uv } = mitredWallBody(5, THICKNESS, miter)
    const touched = mitredVertices(mitreEnd)
    computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    // At least one mitred vertex reaches the wall's own along-axis extreme (the "long side" the
    // module doc describes, `a = 1`) — find it and confirm its projected `u` sits strictly inside
    // the margin-inclusive edge, i.e. the texel inset moved it further in still.
    let sawExtreme = false
    for (const v of touched) {
      const x = positions[v * 3]
      if (Math.abs(x - 2.5) < 1e-9) {
        sawExtreme = true
        expect(uv[v * 2]).toBeGreaterThan(2 / 3)
        expect(uv[v * 2]).toBeLessThan(MARGIN_EDGE_HI)
      }
    }
    expect(sawExtreme).toBe(true)
  })

  it('with `texels: 0`, the long side lands exactly on the margin edge (no further inset)', () => {
    const { positions, mitreEnd, uv } = mitredWallBody(5, THICKNESS, miter)
    const touched = mitredVertices(mitreEnd)
    computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED, undefined, 0)
    let sawExtreme = false
    for (const v of touched) {
      const x = positions[v * 3]
      if (Math.abs(x - 2.5) < 1e-9) {
        sawExtreme = true
        expect(uv[v * 2]).toBeCloseTo(MARGIN_EDGE_HI, 6)
      }
    }
    expect(sawExtreme).toBe(true)
  })
})

describe('computeMitreEndInheritUv — L-corner, 100 mm into 200 mm (both thicknesses)', () => {
  it('the THIN wall (100 mm, slope 2) inherits a valid donor UV', () => {
    const thickness = 0.1
    const miter: WallMiter = { endAt: 2.5 + 2 * (thickness / 2), endSlope: 2 }
    const { positions, mitreEnd, uv } = mitredWallBody(5, thickness, miter)
    const touched = mitredVertices(mitreEnd)
    expect(touched.length).toBeGreaterThan(0)
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    expect(result.inherited).toBe(touched.length)
    expect(result.fallback).toBe(0)
    for (const v of touched) {
      expect(uv[v * 2]).toBeGreaterThanOrEqual(2 / 3)
      expect(uv[v * 2]).toBeLessThanOrEqual(1)
    }
  })

  it('the THICK wall (200 mm, slope 0.5) inherits a valid donor UV', () => {
    const thickness = 0.2
    const miter: WallMiter = { endAt: 2.5 + 0.5 * (thickness / 2), endSlope: 0.5 }
    const { positions, mitreEnd, uv } = mitredWallBody(5, thickness, miter)
    const touched = mitredVertices(mitreEnd)
    expect(touched.length).toBeGreaterThan(0)
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    expect(result.inherited).toBe(touched.length)
    expect(result.fallback).toBe(0)
    for (const v of touched) {
      expect(uv[v * 2]).toBeGreaterThanOrEqual(2 / 3)
      expect(uv[v * 2]).toBeLessThanOrEqual(1)
    }
  })
})

describe('computeMitreEndInheritUv — T-stub retraction never carries the mitre flag', () => {
  const w = (
    id: string,
    start: [number, number],
    end: [number, number],
    thicknessM: number,
  ): WallSpec => ({
    id,
    start,
    end,
    thickness: 'internal',
    thicknessM,
    cutouts: [],
  })

  it('a T-junction resolves to a plain BUTT, not a miter — geometricCornerMiter is never even called', () => {
    // Same shape as wallMitreJoints.test.ts's T-junction fixture: a stub meeting a through wall
    // mid-span. `wallCornerJoin` classifies this as `butt` with a NEGATIVE abut (retraction into
    // the through wall) — the slope-based `applyMiter` path this module's donor logic depends on
    // is structurally unreached here, so no `MITRE_END_ATTR` is ever allocated for it.
    const through = w('through', [0, 0], [6, 0], 0.2)
    const stub = w('stub', [3, 0], [3, 4], 0.1)
    const all = [through, stub]
    const join = wallCornerJoin(stub, all, true)
    expect(join.kind).toBe('butt')
    expect(join.abut).toBeLessThan(0)
  })

  it('is a total no-op on geometry with no mitred vertices at all (an un-mitred, retracted end)', () => {
    // A plain, un-mitred wall body — exactly what a butt/retracted T-stub end builds, since it
    // never passes a `WallMiter` to `extrudeWallBody`.
    const outline = wallBodyOutlineFromSpans([], -2.5, 2.5, HEIGHT)
    const geo = extrudeWallBody(outline, 0.1)
    expect(geo.getAttribute(MITRE_END_ATTR)).toBeUndefined()
    const pos = geo.getAttribute('position')
    const positions = new Float64Array(pos.count * 3)
    for (let i = 0; i < pos.count; i += 1) {
      positions[i * 3] = pos.getX(i)
      positions[i * 3 + 1] = pos.getY(i)
      positions[i * 3 + 2] = pos.getZ(i)
    }
    const { uv } = computeBoxAtlasUv({ positions, indices: null })
    const before = Float32Array.from(uv)
    // No `mitreEnd` attribute in the real pipeline means this function is never even called for
    // such a mesh (see the `if (mitreEnd)` guard in `applyVisibilityLightmaps.ts`), but the
    // function itself must also be inert on an all-zero flag array, which is the same shape as
    // a T-stub's retracted end would present if it were ever handed in by mistake.
    const allZero = new Float32Array(pos.count)
    const result = computeMitreEndInheritUv(positions, allZero, uv, BOTH_OCCUPIED)
    expect(result).toEqual({ inherited: 0, fallback: 0 })
    expect(Array.from(uv)).toEqual(Array.from(before))
  })
})

describe('computeMitreEndInheritUv — a real corner from wallSegments.ts (geometricCornerMiter)', () => {
  const w = (
    id: string,
    start: [number, number],
    end: [number, number],
    thicknessM: number,
  ): WallSpec => ({
    id,
    start,
    end,
    thickness: 'internal',
    thicknessM,
    cutouts: [],
  })

  it('both walls of a real 90° household-shelter-style corner (300 mm interior partitions) resolve real donors', () => {
    // Two 300 mm interior partitions turning a corner, the shape WALL-MITRE-JOINTS names as the
    // household-shelter NE/SE corners: `geometricCornerMiter` returns a slope for this pair (it
    // used to fall back to a buried butt before that fix), and both walls must cut the mitre and
    // both must find a real donor.
    const a = w('a', [0, 0], [5, 0], 0.3)
    const b = w('b', [5, 0], [5, 4], 0.3)
    const cm = geometricCornerMiter(a, b, false)
    expect(cm).not.toBeNull()
    const slope = cm!.slope
    const thickness = wallThicknessMetres(a)
    const miter: WallMiter = { endAt: 2.5 + cm!.abut, endSlope: slope ?? undefined }
    const { positions, mitreEnd, uv } = mitredWallBody(5, thickness, miter)
    const touched = mitredVertices(mitreEnd)
    expect(touched.length).toBeGreaterThan(0)
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    expect(result.fallback).toBe(0)
    expect(result.inherited).toBe(touched.length)
    for (const v of touched) {
      expect(uv[v * 2]).toBeGreaterThanOrEqual(2 / 3)
      expect(uv[v * 2]).toBeLessThanOrEqual(1)
      expect(uv[v * 2 + 1]).toBeGreaterThanOrEqual(0)
      expect(uv[v * 2 + 1]).toBeLessThanOrEqual(1)
    }
  })

  it('a concave (inward) corner mitres with the opposite slope sign and still resolves a donor', () => {
    const a = w('a', [0, 0], [5, 0], 0.1)
    const b = w('b', [5, 0], [5, -4], 0.1)
    const cm = geometricCornerMiter(a, b, false)
    expect(cm).not.toBeNull()
    const miter: WallMiter = { endAt: 2.5 + cm!.abut, endSlope: cm!.slope ?? undefined }
    const { positions, mitreEnd, uv } = mitredWallBody(5, 0.1, miter)
    const touched = mitredVertices(mitreEnd)
    expect(touched.length).toBeGreaterThan(0)
    const result = computeMitreEndInheritUv(positions, mitreEnd, uv, BOTH_OCCUPIED)
    expect(result.fallback).toBe(0)
    expect(result.inherited).toBe(touched.length)
  })
})
