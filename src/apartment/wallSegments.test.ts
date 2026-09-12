import { afterEach, describe, expect, it } from 'vitest'
import { ROOMS, WALLS } from './constants'
import { roomParts } from './roomGeometry'
import type { WallSpec } from './types'
import {
  buildWallSegments,
  localOuterZSign,
  setFlatWallThicknessDefaults,
  setFlatWallThicknessOverrides,
  wallCornerAbut,
  wallCornerJoin,
  wallCornerMiter,
  wallEndAbutmentNeighbor,
  wallThicknessMetres,
} from './wallSegments'
import { extrudeWallBody } from './walls/wallBodyGeometry'
import { buildWallBodyOutline, OPENING_CLEARANCE } from './walls/wallBodyShape'
import type { RoomRect } from './walls/wallRevealMath'
import { pointInRooms } from './walls/wallRevealMath'

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

describe('wallCornerJoin — mitre at true L-corners (any thickness)', () => {
  const wallA: WallSpec = {
    id: 'a',
    start: [0, 0],
    end: [3, 0],
    thickness: 'internal',
    cutouts: [],
  }
  const wallB: WallSpec = {
    id: 'b',
    start: [3, 0],
    end: [3, 3],
    thickness: 'internal',
    cutouts: [],
  }
  // A T-junction: `stem` ends mid-span of wallA (not at a shared corner).
  const stem: WallSpec = { id: 'c', start: [1, 0], end: [1, 2], thickness: 'internal', cutouts: [] }
  const thick: WallSpec = {
    id: 'd',
    start: [3, 0],
    end: [3, 3],
    thickness: 'external',
    cutouts: [],
  }

  it('mitres a mutual L-corner, extending by the NEIGHBOUR half-thickness', () => {
    const j = wallCornerJoin(wallA, [wallA, wallB], false)
    expect(j.kind).toBe('miter')
    expect(j.abut).toBeCloseTo(wallThicknessMetres(wallB) / 2)
  })

  it('mitres an UNEQUAL-thickness corner too (extend by the thick neighbour half)', () => {
    const j = wallCornerJoin(wallA, [wallA, thick], false)
    expect(j.kind).toBe('miter')
    expect(j.abut).toBeCloseTo(wallThicknessMetres(thick) / 2) // 0.1, not wallA's 0.05
  })

  it('does NOT mitre a T-junction (end lands mid-span) — falls back to butt', () => {
    const j = wallCornerJoin(stem, [wallA, stem], true)
    expect(j.kind).toBe('butt')
  })

  it('returns free for an open end', () => {
    expect(wallCornerJoin(wallA, [wallA, wallB], true)).toEqual({ kind: 'free', abut: 0 })
  })

  it('does NOT mitre a mutual end when the two walls are COLLINEAR (HDB-SCALE-AUDIT S12)', () => {
    // A structural-pier split: `pier` is carved out of a straight run between
    // `west` and `east`, all three collinear along z=0. Both `west`/`pier` and
    // `pier`/`east` ends are MUTUAL (each pair terminates at the shared point),
    // but there is no corner turn — misreading this as a mitre sheared the
    // window hole punched near the far end of the thinner neighbour.
    const west: WallSpec = {
      id: 'w',
      start: [0, 0],
      end: [5, 0],
      thickness: 'internal',
      cutouts: [],
    }
    const pier: WallSpec = {
      id: 'p',
      start: [5, 0],
      end: [6, 0],
      thickness: 'internal',
      thicknessM: 0.3,
      cutouts: [],
    }
    const east: WallSpec = {
      id: 'e',
      start: [6, 0],
      end: [10, 0],
      thickness: 'internal',
      cutouts: [],
    }
    const walls = [west, pier, east]
    const eastStart = wallCornerJoin(east, walls, true)
    expect(eastStart).toEqual({ kind: 'butt', abut: 0 })
    const westEnd = wallCornerJoin(west, walls, false)
    expect(westEnd).toEqual({ kind: 'butt', abut: 0 })
  })
})

describe('wallCornerMiter — exact diagonal (concave-aware, thickness-aware)', () => {
  // Convex L: room interior is the [0,3]² square; wallA is the bottom edge, wallB
  // the right edge, meeting at the outer corner (3,0).
  const wallA: WallSpec = {
    id: 'a',
    start: [0, 0],
    end: [3, 0],
    thickness: 'internal',
    cutouts: [],
  }
  const wallB: WallSpec = {
    id: 'b',
    start: [3, 0],
    end: [3, 3],
    thickness: 'internal',
    cutouts: [],
  }
  const wallBthick: WallSpec = {
    id: 'b',
    start: [3, 0],
    end: [3, 3],
    thickness: 'external',
    cutouts: [],
  }
  const insideSquare = (x: number, z: number) => x >= 0 && x <= 3 && z >= 0 && z <= 3
  const outerZSignA = localOuterZSign(3, 0, 0, -1) // wallA outward = (0,-1) → -1

  it('convex equal-thickness corner: slope −1, extend by neighbour half', () => {
    const m = wallCornerMiter(wallA, [wallA, wallB], false, outerZSignA, insideSquare)
    expect(m.slope).toBeCloseTo(-1)
    expect(m.abut).toBeCloseTo(wallThicknessMetres(wallB) / 2)
  })

  it('thickness ratio scales the slope (thin wall meeting a 2× neighbour → slope −2)', () => {
    const m = wallCornerMiter(wallA, [wallA, wallBthick], false, outerZSignA, insideSquare)
    // tNb/tThis = 0.2/0.1 = 2 → |slope| doubles; abut = thick neighbour half (0.1).
    expect(m.slope).toBeCloseTo(-2)
    expect(m.abut).toBeCloseTo(wallThicknessMetres(wallBthick) / 2)
  })

  it('flips sign for the mirror corner (neighbour on the other along-axis side)', () => {
    // A left-edge wall wallC meeting wallA at (0,0): neighbour is now on wallA's
    // −axis side, so the slope flips vs the +axis (right) corner.
    const wallC: WallSpec = {
      id: 'c',
      start: [0, 0],
      end: [0, 3],
      thickness: 'internal',
      cutouts: [],
    }
    const mEnd = wallCornerMiter(wallA, [wallA, wallB], false, outerZSignA, insideSquare) // right
    const mStart = wallCornerMiter(wallA, [wallA, wallC], true, outerZSignA, insideSquare) // left
    expect(Math.sign(mStart.slope ?? 0)).toBe(-Math.sign(mEnd.slope ?? 0))
  })

  it('falls back to butt (slope null) when the neighbour outward is ambiguous', () => {
    const allInterior = () => true // both sides interior → no defined outward
    const m = wallCornerMiter(wallA, [wallA, wallB], false, outerZSignA, allInterior)
    expect(m.slope).toBeNull()
  })
})

describe('localOuterZSign', () => {
  it('is the sign of the outward normal projected onto local +Z (= (-dz, dx)/len)', () => {
    // Wall along +X (dx=2, dz=0): local +Z world = (0, 1). Outward (0,-1) → −1; (0,1) → +1.
    expect(localOuterZSign(2, 0, 0, -1)).toBe(-1)
    expect(localOuterZSign(2, 0, 0, 1)).toBe(1)
    // Wall along +Z (dx=0, dz=2): local +Z world = (-1, 0). Outward (1,0) → −1.
    expect(localOuterZSign(0, 2, 1, 0)).toBe(-1)
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

describe('wallCornerAbut — T-junction vs true corner', () => {
  const w = (id: string, start: [number, number], end: [number, number], thicknessM: number) =>
    ({ id, start, end, thickness: 'internal', thicknessM, cutouts: [] }) as WallSpec

  it('always RETRACTS the stem at a T-junction, whichever way the id tie-break falls', () => {
    // Stem ends on the MIDDLE of a 0.3 m through wall. Only the stem terminates,
    // so there is no corner notch to fill — extending it would drive its body
    // from the through wall's centreline to its far face, a 0.3 m overlap that
    // double-composites the moment both fade (the reveal's bright band).
    const through = w('a-through', [0, 0], [10, 0], 0.3)
    const stemLoses = w('z-stem', [5, 0], [5, 4], 0.1) // id > through → butter
    const stemWins = w('A-stem', [5, 0], [5, 4], 0.1) // id < through → was spanner
    for (const stem of [stemLoses, stemWins]) {
      const abut = wallCornerAbut(stem, [through, stem], true, 0)
      expect(abut, stem.id).toBeLessThan(0)
      // Retracts to the through wall's NEAR face: half of 0.3.
      expect(abut, stem.id).toBeCloseTo(-0.15, 6)
    }
  })

  it('still spans exactly one side of a TRUE corner, so the notch is filled', () => {
    // Both walls END at (5,0): one must span or the corner square is empty.
    const a = w('a-wall', [0, 0], [5, 0], 0.2)
    const b = w('b-wall', [5, 0], [5, 5], 0.1)
    const all = [a, b]
    const abutA = wallCornerAbut(a, all, false, 0)
    const abutB = wallCornerAbut(b, all, true, 0)
    expect(Math.sign(abutA)).not.toBe(Math.sign(abutB))
    // The spanner extends by the NEIGHBOUR's half-thickness.
    expect(abutA).toBeCloseTo(0.05, 6)
    expect(abutB).toBeCloseTo(-0.1, 6)
  })

  it('leaves a free end alone', () => {
    const lone = w('lone', [0, 0], [3, 0], 0.1)
    expect(wallCornerAbut(lone, [lone], false, 0)).toBe(0)
  })
})

describe('HDB-SCALE-AUDIT S12 — bedroom-2/bedroom-3 window clear width, built end-to-end', () => {
  // Same point-in-room probe `WallSegment.tsx` uses to orient each wall's
  // outward normal (module-scope `isInteriorPoint`), rebuilt here from the
  // default plan's own `ROOMS` table so this test exercises the REAL curated
  // flat, not a synthetic stand-in.
  const ROOM_RECTS: RoomRect[] = Object.values(ROOMS).flatMap((r) =>
    roomParts(r).map((p) => ({ x: p.x0, z: p.z0, w: p.x1 - p.x0, d: p.z1 - p.z0 })),
  )
  const isInteriorPoint = (x: number, z: number) => pointInRooms(x, z, ROOM_RECTS, 0.05)

  /** Build a wall's body exactly like `WallSegment.tsx` (corner mitre →
   *  outline → extrude) and read back the built clear width of the named
   *  cutout's hole at each thickness face — the narrower of the two is what
   *  a raycast through the room finds. A wall may carry more than one window
   *  (`wall-ext-N-west` has both the main-bedroom and bedroom-2 windows), so
   *  the search is scoped to the DECLARED span of the requested `refId` (with
   *  headroom for the very shift this test guards against) rather than
   *  spanning every hole on the wall. */
  function builtWindowWidth(wallId: string, refId: string): number {
    const wall = WALLS.find((w) => w.id === wallId)
    if (!wall) throw new Error(`no such wall: ${wallId}`)
    const cutout = wall.cutouts.find((c) => c.refId === refId)
    if (!cutout) throw new Error(`no such cutout: ${refId} on ${wallId}`)
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const length = Math.hypot(dx, dz)
    const half = length / 2
    const declaredA = cutout.offset - half
    const declaredB = cutout.offset + cutout.width - half
    const outerZSign = localOuterZSign(dx, dz, 0, -1) // north wall: outward = -z
    const startCM = wallCornerMiter(wall, WALLS, true, outerZSign, isInteriorPoint)
    const endCM = wallCornerMiter(wall, WALLS, false, outerZSign, isInteriorPoint)
    const outline = buildWallBodyOutline(wall, 2.6, length, startCM.abut, endCM.abut)
    const thickness = wallThicknessMetres(wall)
    const geo = extrudeWallBody(
      outline,
      thickness,
      undefined,
      startCM.slope !== null || endCM.slope !== null
        ? {
            startAt: startCM.slope !== null ? -length / 2 : undefined,
            startSlope: startCM.slope ?? undefined,
            endAt: endCM.slope !== null ? length / 2 : undefined,
            endSlope: endCM.slope ?? undefined,
          }
        : undefined,
    )
    const pos = geo.getAttribute('position')
    // Isolate this hole's boundary vertices: the sill/head height band (clear
    // of the floor and wall-top corners the outer contour also contributes),
    // AND within 0.3 m of the DECLARED span either side — comfortably wider
    // than the mitre-shear bug's ~0.1 m eat but well short of reaching a
    // neighbouring window's hole on the same wall.
    const MARGIN = 0.3
    const byFace = new Map<number, { min: number; max: number }>()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (y < 0.5 || y > 2.45) continue
      if (x < declaredA - MARGIN || x > declaredB + MARGIN) continue
      const key = Math.round(z * 1000)
      const cur = byFace.get(key) ?? { min: Infinity, max: -Infinity }
      cur.min = Math.min(cur.min, x)
      cur.max = Math.max(cur.max, x)
      byFace.set(key, cur)
    }
    geo.dispose()
    expect(byFace.size).toBeGreaterThan(0)
    return Math.min(...[...byFace.values()].map((f) => f.max - f.min))
  }

  it('bedroom 2 and bedroom 3 windows build to the SAME clear width (no pier shear)', () => {
    const b2 = builtWindowWidth('wall-ext-N-west', 'win-bedroom2-N')
    const b3 = builtWindowWidth('wall-ext-N-east', 'win-bedroom3-N')
    expect(b3).toBeCloseTo(b2, 6)
    // Declared 1.5 m less the standard leaf/pane overlap on both jambs
    // (`OPENING_CLEARANCE`, the same "frame" allowance every other opening
    // in the flat measures at) — NOT the further ~100 mm the pier's mitre
    // shear used to eat before this fix.
    expect(b3).toBeCloseTo(1.5 - 2 * OPENING_CLEARANCE, 6)
  })

  it('neither B2/B3 north-wall end is mitred against its structural pier neighbour', () => {
    // `wall-ext-N-west` ends AT the pier; `wall-ext-N-east` starts AT it —
    // both mutual, both collinear, neither a real corner.
    const west = WALLS.find((w) => w.id === 'wall-ext-N-west')
    const east = WALLS.find((w) => w.id === 'wall-ext-N-east')
    if (!west || !east) throw new Error('expected wall-ext-N-west/-east in WALLS')
    expect(wallCornerJoin(west, WALLS, false).kind).toBe('butt')
    expect(wallCornerJoin(east, WALLS, true).kind).toBe('butt')
  })
})
