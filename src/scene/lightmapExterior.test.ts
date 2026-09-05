// @vitest-environment node
import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { pointInBuilding, type WallSeg } from '../floorplan/footprint'
import { EXTERIOR_UV_SENTINEL, markExteriorFaces } from './lightmapExterior'
import { computeBoxAtlasUv } from './lightmapUv'

/**
 * EXTERIOR-FACE-LIGHTMAP, tested against the geometry that actually breaks: a shell wall BOX
 * straddling the building outline, whose two large faces sit on opposite sides of it. The bake
 * fills only the room-facing one, so the outward one must take the sentinel and the room-facing
 * one must keep its atlas UV — getting that pair backwards is the whole defect, inverted.
 */

/** A 10 × 10 m square building, exterior walls given as centre-line segments. */
const OUTLINE: WallSeg[] = [
  { start: [0, 0], end: [10, 0] },
  { start: [10, 0], end: [10, 10] },
  { start: [10, 10], end: [0, 10] },
  { start: [0, 10], end: [0, 0] },
]
const inside = (x: number, z: number) => pointInBuilding(x, z, OUTLINE)

/** World positions + indices + box-atlas `uv1` for a box, exactly as the applier builds them. */
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new BoxGeometry(w, h, d).translate(x, y, z)
  const pos = g.getAttribute('position')
  const nrm = g.getAttribute('normal')
  const world = new Float64Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    world[i * 3] = pos.getX(i)
    world[i * 3 + 1] = pos.getY(i)
    world[i * 3 + 2] = pos.getZ(i)
  }
  const idx = g.index
  if (!idx) throw new Error('BoxGeometry is indexed')
  const indices = new Uint32Array(idx.count)
  for (let i = 0; i < idx.count; i += 1) indices[i] = idx.getX(i)
  const { uv } = computeBoxAtlasUv({ positions: world, indices })
  return { world, indices, uv, nrm, count: pos.count }
}

/**
 * A 10 × 2.6 × 0.2 m façade wall centred ON the `z = 0` outline edge and spanning it end to end —
 * how a real exterior wall sits, with its ends at the building's corners. Its −Z face is 10 cm
 * OUTSIDE the centre-line, its +Z face 10 cm inside it, and its two end caps are at the corners
 * and therefore outside too.
 */
const facade = () => boxAt(10, 2.6, 0.2, 5, 1.3, 0)

const isSentinel = (uv: Float32Array, v: number) =>
  uv[v * 2] === EXTERIOR_UV_SENTINEL && uv[v * 2 + 1] === EXTERIOR_UV_SENTINEL

describe('markExteriorFaces', () => {
  it('sentinels the OUTWARD faces of a façade wall and leaves the room-facing one mapped', () => {
    const { world, indices, uv, nrm, count } = facade()
    // 3 outward quads (−Z, and both end caps at the corners) × 2 triangles. The room-facing +Z
    // quad and the horizontal top/bottom quads are not marked.
    expect(markExteriorFaces(world, indices, uv, inside)).toEqual({ faces: 6, conflicts: 0 })

    for (let v = 0; v < count; v += 1) {
      const ny = nrm.getY(v)
      const nz = nrm.getZ(v)
      if (Math.abs(ny) > 0.5) {
        // Top and bottom: never tested, so their atlas UVs must survive untouched.
        expect(isSentinel(uv, v)).toBe(false)
      } else if (nz > 0.5) {
        // The ROOM-FACING face. This is the assertion the whole fix turns on: its outward probe
        // goes INTO the room, which is still inside the centre-line outline, so a half-thickness
        // offset must not read as "outside".
        expect(isSentinel(uv, v)).toBe(false)
        expect(uv[v * 2]).toBeGreaterThanOrEqual(0)
        expect(uv[v * 2]).toBeLessThanOrEqual(1)
        expect(uv[v * 2 + 1]).toBeGreaterThanOrEqual(0)
        expect(uv[v * 2 + 1]).toBeLessThanOrEqual(1)
      } else {
        expect(isSentinel(uv, v)).toBe(true)
      }
    }
  })

  it('marks every vertical face of a wall standing entirely OUTSIDE the building', () => {
    const { world, indices, uv } = boxAt(3, 2.6, 0.2, 5, 1.3, -4)
    // Four vertical quads × 2 triangles; top and bottom are skipped by the |n.y| gate.
    expect(markExteriorFaces(world, indices, uv, inside)).toEqual({ faces: 8, conflicts: 0 })
  })

  it('marks nothing, and touches no uv, when every face points into the building', () => {
    const { world, indices, uv } = boxAt(3, 2.6, 0.2, 5, 1.3, 5)
    const before = Float32Array.from(uv)
    expect(markExteriorFaces(world, indices, uv, inside)).toEqual({ faces: 0, conflicts: 0 })
    expect(Array.from(uv)).toEqual(Array.from(before))
  })

  it('COUNTS a vertex two faces disagree about rather than silently picking one', () => {
    // A hand-built, deliberately SHARED-corner fan in the z = 0 plane: two triangles sharing the
    // edge v0–v1, wound so one faces −Z (out of the building) and the other +Z (into it). Box and
    // plane geometries never do this — they duplicate corners per face — which is exactly why the
    // counter must exist: silence would be indistinguishable from a correct result.
    const world = new Float64Array([5, 0, 0, 5, 2, 0, 6, 0, 0, 4, 0, 0])
    const indices = new Uint32Array([0, 1, 2, 0, 1, 3])
    const uv = new Float32Array(8).fill(0.5)
    expect(markExteriorFaces(world, indices, uv, inside)).toEqual({ faces: 1, conflicts: 2 })
    // The sentinel still wins for the vertices it claimed — the point is that the disagreement is
    // REPORTED, not that it is resolved differently.
    for (const v of [0, 1, 2]) expect(isSentinel(uv, v)).toBe(true)
    expect(isSentinel(uv, 3)).toBe(false)
  })

  it('works on a non-indexed geometry too', () => {
    const { world, indices, uv } = facade()
    // Expand to the non-indexed form the applier passes when `geometry.index` is null.
    const flat = new Float64Array(indices.length * 3)
    const flatUv = new Float32Array(indices.length * 2)
    for (let i = 0; i < indices.length; i += 1) {
      flat[i * 3] = world[indices[i] * 3]
      flat[i * 3 + 1] = world[indices[i] * 3 + 1]
      flat[i * 3 + 2] = world[indices[i] * 3 + 2]
      flatUv[i * 2] = uv[indices[i] * 2]
      flatUv[i * 2 + 1] = uv[indices[i] * 2 + 1]
    }
    expect(markExteriorFaces(flat, null, flatUv, inside)).toEqual({ faces: 6, conflicts: 0 })
  })
})
