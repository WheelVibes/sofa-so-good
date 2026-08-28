import { describe, expect, it } from 'vitest'
import { ROOMS } from './constants'
import { roomArea, roomCentroid, roomPolygon } from './rooms'

/**
 * These wrap `roomGeometry.ts` and must describe the room's WHOLE footprint.
 * They used to read `origin`/`width`/`depth` directly, so every multi-part room
 * (the MB + its foyer, the L/D's three parts) reported the primary rectangle
 * only — a footprint, centroid and area that quietly excluded the rest.
 */
describe('roomPolygon', () => {
  it('returns 4 corners in NW-NE-SE-SW order for a plain rectangular room', () => {
    const poly = roomPolygon('bedroom2')
    expect(poly).toHaveLength(4)
    const r = ROOMS.bedroom2
    expect(poly[0]).toEqual([r.origin[0], r.origin[1]])
    expect(poly[1]).toEqual([r.origin[0] + r.width, r.origin[1]])
    expect(poly[2]).toEqual([r.origin[0] + r.width, r.origin[1] + r.depth])
    expect(poly[3]).toEqual([r.origin[0], r.origin[1] + r.depth])
  })

  it('returns the full outline of a multi-part room, not just its main rect', () => {
    // Main bedroom = bedroom + south foyer (one extension) → an L, 6 corners.
    const mb = roomPolygon('mainBedroom')
    expect(mb).toHaveLength(6)
    // Living/dining = east column + shelter-side strip + entrance foyer.
    const ld = roomPolygon('livingDining')
    expect(ld.length).toBeGreaterThan(6)
    // Every corner of every declared part lies on or inside the outline's bbox.
    const xs = ld.map((p) => p[0])
    const zs = ld.map((p) => p[1])
    expect(Math.min(...xs)).toBeCloseTo(8.365, 6) // the shelter-side strip's west face
    expect(Math.max(...xs)).toBeCloseTo(12.525, 6)
    expect(Math.min(...zs)).toBeCloseTo(1.3, 6)
    expect(Math.max(...zs)).toBeCloseTo(8.135, 6) // the entrance foyer's south edge
  })
})

describe('roomCentroid', () => {
  it('returns the rectangle center for a plain room', () => {
    const c = roomCentroid('bedroom2')
    const r = ROOMS.bedroom2
    expect(c[0]).toBeCloseTo(r.origin[0] + r.width / 2)
    expect(c[1]).toBeCloseTo(r.origin[1] + r.depth / 2)
  })

  it('centres a multi-part room on its whole bounding box', () => {
    // The MB foyer extends the room 1.1 m further south than its main rect.
    const r = ROOMS.mainBedroom
    const c = roomCentroid('mainBedroom')
    expect(c[1]).toBeGreaterThan(r.origin[1] + r.depth / 2)
    expect(c[1]).toBeCloseTo(r.origin[1] + (r.depth + 1.1) / 2, 6)
  })
})

describe('roomArea', () => {
  it('returns width × depth for a plain room', () => {
    const r = ROOMS.bedroom2
    expect(roomArea('bedroom2')).toBeCloseTo(r.width * r.depth)
  })

  it('counts every part of a multi-part room', () => {
    const r = ROOMS.mainBedroom
    const parts =
      r.width * r.depth + (r.extensions ?? []).reduce((a, e) => a + e.width * e.depth, 0)
    expect(roomArea('mainBedroom')).toBeCloseTo(parts, 6)
    expect(roomArea('mainBedroom')).toBeGreaterThan(r.width * r.depth)
  })
})
