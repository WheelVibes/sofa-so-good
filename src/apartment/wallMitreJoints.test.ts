import { describe, expect, it } from 'vitest'
import { ROOMS, WALLS } from './constants'
import { roomParts } from './roomGeometry'
import type { WallSpec } from './types'
import {
  geometricCornerMiter,
  localOuterZSign,
  wallCornerJoin,
  wallCornerMiter,
  wallEndAbutmentNeighbor,
  wallMitrePartner,
  wallThicknessMetres,
} from './wallSegments'
import { extrudeWallBody } from './walls/wallBodyGeometry'
import { buildWallBodyOutline } from './walls/wallBodyShape'
import type { RoomRect } from './walls/wallRevealMath'
import { pointInRooms } from './walls/wallRevealMath'

const CEILING = 2.6

const w = (
  id: string,
  start: [number, number],
  end: [number, number],
  thicknessM: number,
  cutouts: WallSpec['cutouts'] = [],
): WallSpec => ({ id, start, end, thickness: 'internal', thicknessM, cutouts })

/**
 * The two world-space endpoints of a wall's mitred end-face, at its two thickness
 * faces. In the wall's local frame the cut is `x = at + slope·z` with `at =
 * ±length/2`; this maps `z = ±thickness/2` back to world. Two walls that mitre the
 * SAME corner must return the SAME pair of points — that is what "zero overlap
 * volume, zero gap" means, and it is the only property the whole feature rests on.
 */
function mitreVertices(wall: WallSpec, atStart: boolean, slope: number): [number, number][] {
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len
  const mx = (wall.start[0] + wall.end[0]) / 2
  const mz = (wall.start[1] + wall.end[1]) / 2
  const at = atStart ? -len / 2 : len / 2
  const t = wallThicknessMetres(wall)
  return [t / 2, -t / 2].map((z) => {
    const x = at + slope * z
    // local +Z in world = (-uz, ux) — the `[0,-angle,0]` rotation WallSegment applies.
    return [mx + x * ux + z * -uz, mz + x * uz + z * ux] as [number, number]
  })
}

/** Set-equality of two world point pairs, to sub-millimetre. */
function samePointPair(a: [number, number][], b: [number, number][]): boolean {
  const near = (p: [number, number], q: [number, number]) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6
  return (near(a[0], b[0]) && near(a[1], b[1])) || (near(a[0], b[1]) && near(a[1], b[0]))
}

/** Assert the L-corner shared by `a` and `b` mitres to ONE line from both sides. */
function expectSharedMitre(a: WallSpec, b: WallSpec, aAtStart: boolean, bAtStart: boolean) {
  const ma = geometricCornerMiter(a, b, aAtStart)
  const mb = geometricCornerMiter(b, a, bAtStart)
  expect(ma).not.toBeNull()
  expect(mb).not.toBeNull()
  const va = mitreVertices(a, aAtStart, ma!.slope!)
  const vb = mitreVertices(b, bAtStart, mb!.slope!)
  expect(samePointPair(va, vb)).toBe(true)
  return { ma: ma!, mb: mb!, va }
}

describe('WALL-MITRE-JOINTS — geometricCornerMiter', () => {
  it('L at 90 degrees, equal thickness: one shared 45 degree seam', () => {
    // North wall west→east ending at (5,0); east wall (5,0) running south.
    const a = w('a', [0, 0], [5, 0], 0.1)
    const b = w('b', [5, 0], [5, 4], 0.1)
    const { ma, va } = expectSharedMitre(a, b, false, true)
    expect(Math.abs(ma.slope!)).toBeCloseTo(1, 12) // 45 degrees for equal thickness
    expect(ma.abut).toBeCloseTo(0.05, 12) // half the neighbour's thickness
    // The seam runs from the CONVEX vertex (5.05, -0.05) to the CONCAVE one (4.95, 0.05).
    const xs = va.map((p) => p[0]).sort()
    const zs = va.map((p) => p[1]).sort()
    expect(xs).toEqual([expect.closeTo(4.95, 9), expect.closeTo(5.05, 9)])
    expect(zs).toEqual([expect.closeTo(-0.05, 9), expect.closeTo(0.05, 9)])
  })

  it('L at 90 degrees, 100 mm into 200 mm: both walls still cut the SAME line', () => {
    const thin = w('thin', [0, 0], [5, 0], 0.1)
    const thick = w('thick', [5, 0], [5, 4], 0.2)
    const { ma, mb, va } = expectSharedMitre(thin, thick, false, true)
    // The slope carries the thickness RATIO, so the two cuts coincide in world space.
    expect(Math.abs(ma.slope!)).toBeCloseTo(0.2 / 0.1, 12)
    expect(Math.abs(mb.slope!)).toBeCloseTo(0.1 / 0.2, 12)
    // Each wall extends just far enough to reach the shared convex vertex.
    expect(ma.abut).toBeCloseTo(0.1, 12) // 2.0 * 0.05
    expect(mb.abut).toBeCloseTo(0.05, 12) // 0.5 * 0.1
    const xs = va.map((p) => p[0]).sort()
    expect(xs).toEqual([expect.closeTo(4.9, 9), expect.closeTo(5.1, 9)])
  })

  it('a NON-90 degree corner mitres to the bisector too', () => {
    const a = w('a', [0, 0], [5, 0], 0.1)
    // 60 degrees off the first wall's axis.
    const b = w('b', [5, 0], [5 + 3 * Math.cos(Math.PI / 3), 3 * Math.sin(Math.PI / 3)], 0.1)
    const { ma, va } = expectSharedMitre(a, b, false, true)
    expect(Number.isFinite(ma.slope!)).toBe(true)
    // The seam still passes through the centre-line corner (5, 0): its two vertices
    // are symmetric about it.
    expect((va[0][0] + va[1][0]) / 2).toBeCloseTo(5, 9)
    expect((va[0][1] + va[1][1]) / 2).toBeCloseTo(0, 9)
  })

  it('a CONCAVE (inward) corner mitres with the opposite sign, same shared line', () => {
    // The same L, but the second wall turns the other way.
    const a = w('a', [0, 0], [5, 0], 0.1)
    const b = w('b', [5, 0], [5, -4], 0.1)
    const { ma } = expectSharedMitre(a, b, false, true)
    const flipped = geometricCornerMiter(a, w('b2', [5, 0], [5, 4], 0.1), false)
    expect(Math.sign(ma.slope!)).toBe(-Math.sign(flipped!.slope!))
  })

  it('a collinear continuation is not a corner — no mitre', () => {
    const a = w('a', [0, 0], [5, 0], 0.1)
    const b = w('b', [5, 0], [9, 0], 0.1)
    expect(geometricCornerMiter(a, b, false)).toBeNull()
  })

  it('a T-junction is NOT mitred: the through wall runs on, the stub butts', () => {
    // A mitre is not defined for three ends meeting; the through wall must stay
    // continuous or its face would be notched by the stub.
    const through = w('through', [0, 0], [6, 0], 0.2)
    const stub = w('stub', [3, 0], [3, 4], 0.1)
    const all = [through, stub]
    expect(wallCornerJoin(stub, all, true).kind).toBe('butt')
    const cm = wallCornerMiter(stub, all, true, 1, () => false, true)
    expect(cm.slope).toBeNull()
    // …and it retracts into the through wall rather than crossing it.
    expect(cm.abut).toBeLessThan(0)
    // The through wall's own ends see no neighbour here at all.
    expect(wallCornerJoin(through, all, false).kind).toBe('free')
  })

  it('an X/cross junction mitres each turning pair and leaves the collinear arms straight', () => {
    // Four arms at one point. The two collinear pairs continue straight (no corner);
    // every turning pair shares one mitre line.
    const e = w('e', [0, 0], [4, 0], 0.1)
    const wst = w('w', [-4, 0], [0, 0], 0.1)
    const s = w('s', [0, 0], [0, 4], 0.1)
    const n = w('n', [0, -4], [0, 0], 0.1)
    expect(geometricCornerMiter(e, wst, true)).toBeNull()
    expect(geometricCornerMiter(s, n, true)).toBeNull()
    for (const [p, q, pStart, qStart] of [
      [e, s, true, true],
      [e, n, true, false],
      [wst, s, false, true],
      [wst, n, false, false],
    ] as const) {
      expectSharedMitre(p, q, pStart, qStart)
    }
  })

  it('a mitred wall still carries its door opening', () => {
    const wall = w('d', [0, 0], [5, 0], 0.1, [
      { kind: 'door', offset: 2, width: 0.9, sill: 0, head: 2.1 },
    ])
    const nb = w('nb', [5, 0], [5, 4], 0.1)
    const cm = geometricCornerMiter(wall, nb, false)!
    const body = buildWallBodyOutline(wall, CEILING, 5, 0, cm.abut)
    const geo = extrudeWallBody(body, 0.1, undefined, {
      endAt: 2.5,
      endSlope: cm.slope!,
    })
    // The opening is still carved as a bottom notch, a hair inside the leaf
    // (OPENING_CLEARANCE), and the mitre has not disturbed it.
    const notchTops = body.outline.filter((p) => Math.abs(p[1] - 2.1 + 0.01) < 1e-9)
    expect(notchTops.map((p) => p[0])).toEqual([expect.closeTo(-0.49, 9), expect.closeTo(0.39, 9)])
    const pos = geo.getAttribute('position')
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i))
      maxX = Math.max(maxX, pos.getX(i))
    }
    expect(minX).toBeCloseTo(-2.5, 6) // free start, untouched
    expect(maxX).toBeCloseTo(2.5 + cm.abut, 6) // convex vertex
    geo.dispose()
  })
})

describe('WALL-MITRE-JOINTS — the curated flat', () => {
  const RR: RoomRect[] = Object.values(ROOMS).flatMap((r) =>
    roomParts(r).map((p) => ({ x: p.x0, z: p.z0, w: p.x1 - p.x0, d: p.z1 - p.z0 })),
  )
  const isInteriorPoint = (x: number, z: number) => pointInRooms(x, z, RR, 0.05)
  const cm = (wall: WallSpec, atStart: boolean, on: boolean) => {
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz) || 1
    const outerZSign = localOuterZSign(dx, dz, -dz / len, dx / len)
    return wallCornerMiter(wall, WALLS, atStart, outerZSign, isInteriorPoint, on)
  }

  it('mitres EVERY corner it classifies as an L, and every butt is a real T', () => {
    const unmitred: string[] = []
    const mitred: string[] = []
    for (const wall of WALLS) {
      for (const atStart of [true, false]) {
        if (wallCornerJoin(wall, WALLS, atStart).kind !== 'miter') continue
        const cut = cm(wall, atStart, true)
        ;(cut.slope === null ? unmitred : mitred).push(`${wall.id}@${atStart ? 'start' : 'end'}`)
      }
    }
    expect(unmitred).toEqual([])
    // 14 reciprocal L-corners = 28 mitred ends. Before WALL-MITRE-JOINTS, 13 of
    // these ends fell back to a buried butt because the neighbour was an interior
    // partition with rooms on both sides.
    expect(mitred.length).toBe(28)
  })

  it('the flag OFF restores the legacy probe fallback (13 ambiguous L ends butt)', () => {
    let butted = 0
    for (const wall of WALLS) {
      for (const atStart of [true, false]) {
        if (wallCornerJoin(wall, WALLS, atStart, false).kind !== 'miter') continue
        if (cm(wall, atStart, false).slope === null) butted++
      }
    }
    expect(butted).toBe(13)
  })

  it('a mitre partner is always MUTUAL — no end cuts to a diagonal the other ignores', () => {
    for (const wall of WALLS) {
      for (const atStart of [true, false]) {
        const p = wallMitrePartner(wall, WALLS, atStart)
        if (!p) continue
        const point = atStart ? wall.start : wall.end
        const pAtStart = Math.hypot(p.start[0] - point[0], p.start[1] - point[1]) < 0.02
        expect(wallMitrePartner(p, WALLS, pAtStart)?.id).toBe(wall.id)
      }
    }
  })

  it('the household-shelter NE/SE corners — two 300 mm interior partitions — now mitre', () => {
    // Both walls are interior partitions with rooms on BOTH sides, so the old
    // outward-normal probe was undefined and one 300 mm box ran through the other.
    for (const [a, b] of [
      ['wall-int-hs-N', 'wall-int-shelter-LD'],
      ['wall-int-hs-S', 'wall-int-shelter-LD'],
      ['wall-int-bedroom-S', 'wall-int-b3-LD'],
      ['wall-int-mb-b2', 'wall-int-bedroom-S'],
    ] as const) {
      const wa = WALLS.find((x) => x.id === a)!
      const wb = WALLS.find((x) => x.id === b)!
      const pt = [wa.start, wa.end].find((p) =>
        [wb.start, wb.end].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02),
      )!
      const aAtStart = pt === wa.start
      const bAtStart = Math.hypot(wb.start[0] - pt[0], wb.start[1] - pt[1]) < 0.02
      const ma = cm(wa, aAtStart, true)
      const mb = cm(wb, bAtStart, true)
      expect(ma.slope).not.toBeNull()
      expect(mb.slope).not.toBeNull()
      expect(
        samePointPair(
          mitreVertices(wa, aAtStart, ma.slope!),
          mitreVertices(wb, bAtStart, mb.slope!),
        ),
      ).toBe(true)
    }
  })

  it('the bath2 / service-yard junction is a T, and the stub no longer runs THROUGH the run', () => {
    // (5.765, 6.825): `wall-int-mid-S` (100 mm) and `wall-int-hs-S` (300 mm) are one
    // straight run; `wall-int-bath2-hs` (300 mm) arrives from the north. A mitre is
    // not defined for three ends, so the run continues and the stub butts — where
    // before the stub EXTENDED 50 mm past the centre-line, straight through the run's
    // body, which is the stepped double layer the user photographed.
    const stub = WALLS.find((x) => x.id === 'wall-int-bath2-hs')!
    const mid = WALLS.find((x) => x.id === 'wall-int-mid-S')!
    const hs = WALLS.find((x) => x.id === 'wall-int-hs-S')!
    expect(wallCornerJoin(stub, WALLS, false, false).abut).toBeCloseTo(0.05, 9) // legacy: spans
    const join = wallCornerJoin(stub, WALLS, false)
    expect(join.kind).toBe('butt')
    // Retracts to the NEAREST face at the junction (min half-thickness), so no gap
    // opens over the thinner segment.
    expect(join.abut).toBeCloseTo(-(0.05 - 0.01), 9)
    // …and the run itself is continuous through the junction.
    expect(wallCornerJoin(mid, WALLS, false).abut).toBe(0)
    expect(wallCornerJoin(hs, WALLS, true).abut).toBe(0)
    expect(wallMitrePartner(stub, WALLS, false)).toBeNull()
  })

  it('every mitred pair in the flat cuts ONE shared line (zero overlap, zero gap)', () => {
    let pairs = 0
    for (const wall of WALLS) {
      for (const atStart of [true, false]) {
        const join = wallCornerJoin(wall, WALLS, atStart)
        if (join.kind !== 'miter') continue
        const point = atStart ? wall.start : wall.end
        const other = wallEndAbutmentNeighbor(wall, WALLS, atStart)
        if (!other) continue
        const otherAtStart = Math.hypot(other.start[0] - point[0], other.start[1] - point[1]) < 0.02
        const ma = cm(wall, atStart, true)
        const mb = cm(other, otherAtStart, true)
        if (ma.slope === null || mb.slope === null) continue
        const va = mitreVertices(wall, atStart, ma.slope)
        const vb = mitreVertices(other, otherAtStart, mb.slope)
        if (!samePointPair(va, vb)) {
          require('node:fs').appendFileSync(
            '/tmp/mitrefail.txt',
            `${wall.id}@${atStart} <-> ${other.id}@${otherAtStart} A=${JSON.stringify(va)} B=${JSON.stringify(vb)} ptA=${point} ptB=${otherAtStart ? other.start : other.end}\n`,
          )
        }
        pairs++
      }
    }
    expect(pairs).toBe(28)
  })
})
