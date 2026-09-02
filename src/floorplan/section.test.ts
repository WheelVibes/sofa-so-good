import { describe, expect, it } from 'vitest'
import { buildSection, conventionalSectionCuts, type SectionItemInput } from './section'
import type { FloorPlan, PlanOpening, PlanRoom, PlanVec2, PlanWall } from './types'

function wall(
  id: string,
  start: PlanVec2,
  end: PlanVec2,
  thickness: 'external' | 'internal' = 'external',
  topHeight?: number,
): PlanWall {
  return { id, start, end, thickness, ...(topHeight !== undefined ? { topHeight } : {}) }
}

function room(id: string, origin: PlanVec2, width: number, depth: number, name = id): PlanRoom {
  return { id, name, origin, width, depth }
}

/** A 6 x 4 rectangular plan: 4 perimeter walls + one full-width room. */
function rectPlan(): FloorPlan {
  return {
    id: 'p',
    name: 'Rect',
    ceilingHeight: 2.8,
    extent: [6, 4],
    walls: [
      wall('n', [0, 0], [6, 0]), // top (z=0), runs along X
      wall('s', [0, 4], [6, 4]), // bottom (z=4), runs along X
      wall('w', [0, 0], [0, 4]), // left (x=0), runs along Z
      wall('e', [6, 0], [6, 4]), // right (x=6), runs along Z
    ],
    openings: [],
    rooms: [room('living', [0, 0], 6, 4, 'Living')],
  }
}

describe('buildSection', () => {
  it('cut through the middle along Z (x=3) crosses the two walls running along X', () => {
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 })
    expect(s.axis).toBe('x')
    expect(s.at).toBe(3)
    // The north (z=0) and south (z=4) walls run along X and are crossed by x=3.
    expect(s.walls.length).toBe(2)
    const positions = s.walls.map((w) => w.pos).sort((a, b) => a - b)
    expect(positions[0]).toBeCloseTo(0, 6)
    expect(positions[1]).toBeCloseTo(4, 6)
    // All cut walls floor→ceiling at 2.8 m.
    for (const w of s.walls) {
      expect(w.cut).toBe(true)
      expect(w.base).toBeCloseTo(0, 6)
      expect(w.top).toBeCloseTo(2.8, 6)
      expect(w.thickness).toBeCloseTo(0.2, 6)
    }
    expect(s.height).toBeCloseTo(2.8, 6)
    expect(s.floorY).toBe(0)
  })

  it('cut through the middle along X (z=2) crosses the two walls running along Z', () => {
    const s = buildSection(rectPlan(), { axis: 'z', at: 2 })
    expect(s.walls.length).toBe(2)
    const positions = s.walls.map((w) => w.pos).sort((a, b) => a - b)
    expect(positions[0]).toBeCloseTo(0, 6)
    expect(positions[1]).toBeCloseTo(6, 6)
  })

  it('reports the room the cut passes through as a labelled floor segment', () => {
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 })
    expect(s.rooms.length).toBe(1)
    const r = s.rooms[0]!
    expect(r.name).toBe('Living')
    expect(r.start).toBeCloseTo(0, 6)
    expect(r.end).toBeCloseTo(4, 6)
    // Ceiling run mirrors the room span.
    expect(s.ceil.length).toBe(1)
    expect(s.ceil[0]!.y).toBeCloseTo(2.8, 6)
  })

  it('a window on a cut wall shows a gap with its sill/head', () => {
    const plan = rectPlan()
    // Window on the south wall (runs along X from x=0..6); cut x=3 falls at
    // distance 3 along the wall, inside the window [2..4].
    const win: PlanOpening = {
      id: 'win',
      kind: 'window',
      wallId: 's',
      offset: 2,
      width: 2,
      sill: 0.9,
      head: 2.1,
    }
    plan.openings = [win]
    const s = buildSection(plan, { axis: 'x', at: 3 })
    expect(s.openings.length).toBe(1)
    const o = s.openings[0]!
    expect(o.kind).toBe('window')
    expect(o.sill).toBeCloseTo(0.9, 6)
    expect(o.head).toBeCloseTo(2.1, 6)
    // CORRECTED v0.31.5.282 (was pinned at 2, the opening's along-wall run).
    // The section plane is x = 3 spanning (z, y). The host wall runs along X at
    // z = 4 with thickness t in z, so the plane meets the wall — and the window
    // in it — over z in [4 - t/2, 4 + t/2]. The void's horizontal extent is the
    // WALL THICKNESS; the 2 m figure is the window's extent along X, which this
    // plane only touches at a single point. The old value drew a 2 m hole in a
    // 0.2 m wall column, spilling across the rooms either side (visible in the
    // Open Loft report frame).
    expect(o.width).toBeCloseTo(0.2, 6)
    // Gap sits on the south wall (pos z=4).
    expect(o.pos).toBeCloseTo(4, 6)
  })

  it('a door on a cut wall gives a gap from the floor (sill 0)', () => {
    const plan = rectPlan()
    plan.openings = [
      { id: 'd', kind: 'door', wallId: 'n', offset: 2.5, width: 0.9, sill: 0, head: 2.1 },
    ]
    const s = buildSection(plan, { axis: 'x', at: 3 })
    expect(s.openings.length).toBe(1)
    expect(s.openings[0]!.kind).toBe('door')
    expect(s.openings[0]!.sill).toBe(0)
  })

  it('omits an opening whose run does not reach the cut line', () => {
    const plan = rectPlan()
    // Window at x=[0..1] on south wall; cut at x=3 misses it.
    plan.openings = [
      { id: 'w', kind: 'window', wallId: 's', offset: 0, width: 1, sill: 0.9, head: 2.1 },
    ]
    const s = buildSection(plan, { axis: 'x', at: 3 })
    expect(s.openings.length).toBe(0)
  })

  it('respects parapet topHeight for the wall column top', () => {
    const plan = rectPlan()
    plan.walls = plan.walls.map((w) => (w.id === 'n' ? { ...w, topHeight: 1.1 } : w))
    const s = buildSection(plan, { axis: 'x', at: 3 })
    const parapet = s.walls.find((w) => w.pos < 0.5)
    expect(parapet).toBeDefined()
    expect(parapet!.top).toBeCloseTo(1.1, 6)
  })

  it('uses per-room ceiling height for the cut wall top + ceiling run', () => {
    const plan = rectPlan()
    plan.rooms = [{ ...plan.rooms[0]!, ceilingHeight: 3.2 }]
    const s = buildSection(plan, { axis: 'x', at: 3 })
    expect(s.ceil[0]!.y).toBeCloseTo(3.2, 6)
    for (const w of s.walls) expect(w.top).toBeCloseTo(3.2, 6)
    expect(s.height).toBeCloseTo(3.2, 6)
  })

  it('cut outside the plan bounds yields an empty section without throwing', () => {
    const s = buildSection(rectPlan(), { axis: 'x', at: 99 })
    expect(s.walls).toEqual([])
    expect(s.openings).toEqual([])
    expect(s.rooms).toEqual([])
    expect(s.items).toEqual([])
    expect(s.ceil).toEqual([])
    expect(s.length).toBe(0)
    expect(s.height).toBe(0)
  })

  it('a bare shell (no silhouettes supplied) has no furniture items', () => {
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 })
    expect(s.items).toEqual([])
  })

  it('guards an empty / malformed plan', () => {
    const empty = buildSection(
      { id: 'e', name: '', ceilingHeight: 2.8, extent: [0, 0], walls: [], openings: [], rooms: [] },
      { axis: 'x', at: 0 },
    )
    expect(empty.walls).toEqual([])
    expect(empty.rooms).toEqual([])

    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input.
    const junk = buildSection({} as any, { axis: 'z', at: 1 })
    expect(junk.walls).toEqual([])
    // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input.
    const nullPlan = buildSection(null as any, { axis: 'z', at: 1 })
    expect(nullPlan.walls).toEqual([])
  })

  it('guards non-array walls/openings/rooms', () => {
    const plan = {
      id: 'p',
      name: '',
      ceilingHeight: 2.8,
      extent: [6, 4],
      walls: null,
      openings: undefined,
      rooms: 'nope',
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input.
    } as any
    const s = buildSection(plan, { axis: 'x', at: 3 })
    expect(s.walls).toEqual([])
    expect(s.rooms).toEqual([])
    expect(s.openings).toEqual([])
    expect(s.items).toEqual([])
  })
})

describe('buildSection — furniture silhouettes beyond the cut', () => {
  /** A 2×1 m footprint centred at (3, 2): straddles the x=3 cut line. */
  const sofa: SectionItemInput = {
    id: 's1',
    label: 'Sofa',
    corners: [
      [2, 1.5],
      [4, 1.5],
      [4, 2.5],
      [2, 2.5],
    ],
    height: 0.8,
  }

  it('projects a piece in the cut band onto the section (along extent × height)', () => {
    // axis 'x' (cut at x=3): the along axis is Z, so the sofa spans z=1.5..2.5.
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 }, [sofa])
    expect(s.items.length).toBe(1)
    const it = s.items[0]!
    expect(it.label).toBe('Sofa')
    expect(it.start).toBeCloseTo(1.5, 6)
    expect(it.end).toBeCloseTo(2.5, 6)
    expect(it.height).toBeCloseTo(0.8, 6)
  })

  it('skips a piece whose footprint does not straddle the cut line', () => {
    const s = buildSection(rectPlan(), { axis: 'x', at: 0.5 }, [sofa])
    expect(s.items).toEqual([])
  })

  it('sorts items tallest-first (painted back-to-front)', () => {
    const tall: SectionItemInput = { ...sofa, id: 's2', label: 'Wardrobe', height: 2.0 }
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 }, [sofa, tall])
    expect(s.items.map((i) => i.label)).toEqual(['Wardrobe', 'Sofa'])
  })

  it('a tall piece raises the section height when it exceeds the ceiling', () => {
    const overheight: SectionItemInput = { ...sofa, height: 3.5 }
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 }, [overheight])
    expect(s.height).toBeCloseTo(3.5, 6)
  })

  it('drops malformed silhouettes without throwing', () => {
    const junk = [
      { id: 's', label: 'ok', corners: [[2, 1]], height: 1 }, // too few corners
      { id: 's', label: 'ok', corners: sofa.corners, height: 0 }, // zero height
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input.
      null as any,
      sofa,
    ]
    // biome-ignore lint/suspicious/noExplicitAny: mixed malformed inputs.
    const s = buildSection(rectPlan(), { axis: 'x', at: 3 }, junk as any)
    expect(s.items.length).toBe(1)
    expect(s.items[0]!.label).toBe('Sofa')
  })
})

describe('conventionalSectionCuts', () => {
  it('returns BOTH conventional cuts — a cross section A and a longitudinal B', () => {
    const cuts = conventionalSectionCuts(rectPlan())
    expect(cuts.map((c) => c.mark)).toEqual(['A', 'B'])
    expect(cuts.find((c) => c.mark === 'A')!.cut.axis).toBe('z')
    expect(cuts.find((c) => c.mark === 'B')!.cut.axis).toBe('x')
  })

  it('returns nothing for a plan with no walls, rather than two empty sheets', () => {
    expect(conventionalSectionCuts({ ...rectPlan(), walls: [] })).toEqual([])
  })

  it('picks a position that actually crosses the plan', () => {
    for (const { cut } of conventionalSectionCuts(rectPlan())) {
      const s = buildSection(rectPlan(), cut)
      expect(s.walls.length).toBeGreaterThan(0)
    }
  })

  it('is deterministic — repeated calls agree', () => {
    const a = conventionalSectionCuts(rectPlan())
    const b = conventionalSectionCuts(rectPlan())
    expect(a).toEqual(b)
  })

  it('prefers the cut that crosses more, not the blind midpoint', () => {
    // A plan whose mid-Z band is empty but which has an internal partition
    // off-centre: the chosen cross-section must cross that partition.
    const plan = {
      ...rectPlan(),
      walls: [
        ...rectPlan().walls,
        {
          id: 'p1',
          start: [0, 1] as [number, number],
          end: [5, 1] as [number, number],
          thickness: 'internal' as const,
        },
      ],
    }
    const cross = conventionalSectionCuts(plan).find((c) => c.mark === 'A')
    expect(cross).toBeDefined()
    const s = buildSection(plan, cross!.cut)
    expect(s.walls.length).toBeGreaterThan(0)
  })
})
