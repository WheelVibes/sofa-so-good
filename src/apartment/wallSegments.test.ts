import { afterEach, describe, expect, it } from 'vitest'
import type { WallSpec } from './types'
import {
  buildWallSegments,
  setFlatWallThicknessDefaults,
  setFlatWallThicknessOverrides,
  wallCornerAbut,
  wallEndAbutmentNeighbor,
  wallThicknessMetres,
} from './wallSegments'
import { OPENING_CLEARANCE } from './walls/wallBodyShape'

const ceiling = 2.6

describe('wallThicknessMetres + setFlatWallThicknessDefaults', () => {
  const ext: WallSpec = { id: 'e', start: [0, 0], end: [1, 0], thickness: 'external', cutouts: [] }
  const int: WallSpec = { id: 'i', start: [0, 0], end: [1, 0], thickness: 'internal', cutouts: [] }
  afterEach(() => {
    setFlatWallThicknessDefaults(undefined) // reset to built-ins
    setFlatWallThicknessOverrides(undefined)
  })

  it('defaults to the built-in 0.2 / 0.1 m', () => {
    expect(wallThicknessMetres(ext)).toBe(0.2)
    expect(wallThicknessMetres(int)).toBe(0.1)
  })

  it('honours a global default override and resets when cleared', () => {
    setFlatWallThicknessDefaults({ external: 0.3, internal: 0.18 })
    expect(wallThicknessMetres(ext)).toBe(0.3)
    expect(wallThicknessMetres(int)).toBe(0.18)
    setFlatWallThicknessDefaults({}) // partial/empty → both reset to built-ins
    expect(wallThicknessMetres(ext)).toBe(0.2)
    expect(wallThicknessMetres(int)).toBe(0.1)
  })

  it('a per-wall override wins over the global default and built-in', () => {
    setFlatWallThicknessDefaults({ external: 0.3 })
    setFlatWallThicknessOverrides([{ id: 'e', thicknessM: 0.5 }])
    expect(wallThicknessMetres(ext)).toBe(0.5) // override
    expect(wallThicknessMetres(int)).toBe(0.1) // no override, no internal default
    setFlatWallThicknessOverrides([]) // cleared → back to default/built-in
    expect(wallThicknessMetres(ext)).toBe(0.3)
  })
})

describe('wallCornerAbut — zero-overlap corner tiling (no double translucency, no z-fight)', () => {
  // An L-corner: wallA runs along X ending at the origin corner; wallB runs along
  // Z starting at that same corner. They meet at (0,0).
  const wallA: WallSpec = {
    id: 'a',
    start: [-2, 0],
    end: [0, 0],
    thickness: 'internal',
    cutouts: [],
  }
  const wallB: WallSpec = {
    id: 'b',
    start: [0, 0],
    end: [0, 2],
    thickness: 'internal',
    cutouts: [],
  }
  const walls = [wallA, wallB]

  it('finds the abutting neighbour at a shared corner, null at a free end', () => {
    expect(wallEndAbutmentNeighbor(wallA, walls, false)?.id).toBe('b') // A.end meets B
    expect(wallEndAbutmentNeighbor(wallA, walls, true)).toBeNull() // A.start is free
    expect(wallEndAbutmentNeighbor(wallB, walls, true)?.id).toBe('a') // B.start meets A
  })

  it('exactly ONE wall spans the corner (id tie-break); the other retracts', () => {
    // 'a' < 'b' → A spans at its end, B retracts at its start.
    const aEnd = wallCornerAbut(wallA, walls, false) // A spans
    const bStart = wallCornerAbut(wallB, walls, true) // B butts
    const half = wallThicknessMetres(wallA) / 2 // 0.05 (both internal)
    expect(aEnd).toBeCloseTo(half) // spanner extends by the neighbour's half-thickness
    expect(bStart).toBeCloseTo(-(half - OPENING_CLEARANCE)) // butter retracts, buried by ε
  })

  it('the butter never ends coplanar with the spanner face (buried by OPENING_CLEARANCE)', () => {
    const bStart = wallCornerAbut(wallB, walls, true)
    // A retract of exactly half would be coplanar (z-fight); the ε keeps the
    // butter end-cap buried inside the spanner instead.
    expect(bStart).not.toBeCloseTo(-(wallThicknessMetres(wallA) / 2))
    expect(bStart).toBeGreaterThan(-(wallThicknessMetres(wallA) / 2))
  })

  it('returns 0 for a free end', () => {
    expect(wallCornerAbut(wallA, walls, true)).toBe(0)
  })
})

describe('buildWallSegments', () => {
  it('returns one full-height segment for a wall with no cutouts', () => {
    const wall: WallSpec = {
      id: 'w',
      start: [0, 0],
      end: [4, 0],
      thickness: 'internal',
      cutouts: [],
    }
    const seg = buildWallSegments(wall, ceiling)
    expect(seg).toEqual([{ start: 0, end: 4, bottom: 0, top: ceiling }])
  })

  it('splits around a door and adds a header above it', () => {
    const wall: WallSpec = {
      id: 'w',
      start: [0, 0],
      end: [4, 0],
      thickness: 'internal',
      cutouts: [{ kind: 'door', offset: 1, width: 0.8, sill: 0, head: 2.1 }],
    }
    const seg = buildWallSegments(wall, ceiling)
    expect(seg).toContainEqual({ start: 0, end: 1, bottom: 0, top: ceiling })
    expect(seg).toContainEqual({ start: 1.8, end: 4, bottom: 0, top: ceiling })
    expect(seg).toContainEqual({ start: 1, end: 1.8, bottom: 2.1, top: ceiling })
  })

  it('emits sill below a window plus header above', () => {
    const wall: WallSpec = {
      id: 'w',
      start: [0, 0],
      end: [4, 0],
      thickness: 'external',
      cutouts: [{ kind: 'window', offset: 1, width: 1.5, sill: 0.95, head: 2.1 }],
    }
    const seg = buildWallSegments(wall, ceiling)
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 0, top: 0.95 })
    expect(seg).toContainEqual({ start: 1, end: 2.5, bottom: 2.1, top: ceiling })
  })
})
