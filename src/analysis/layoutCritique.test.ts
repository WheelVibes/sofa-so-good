import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildLayoutCritique, CRITIQUE } from './layoutCritique'

/** One 6 x 5 m living room. */
function plan(): FloorPlan {
  return {
    name: 'p',
    extent: [6, 5],
    ceilingHeight: 2.6,
    walls: [],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 6, depth: 5 }],
  } as unknown as FloorPlan
}

function def(id: string, w: number, d: number): FurnitureDef {
  return {
    id,
    name: id,
    category: 'seating',
    kind: 'primitive',
    defaultFootprint: { w, d },
  } as unknown as FurnitureDef
}

function item(id: string, defId: string, x: number, z: number): FurnitureItem {
  return { id, defId, position: [x, z], rotation: 0, props: {} } as unknown as FurnitureItem
}

/**
 * A real TV fixture (v0.31.8.19). These tests previously used `tv-console` as
 * "the TV", because the old `TV_RE = /^tv/` accepted it — so the fixtures
 * encoded the bug: a media console with no screen was being measured for
 * viewing distance. A TV is now selected by the authored screen capability (a
 * `screenContent` enum in the paramSchema), which a console does not have.
 */
function tvDef(id: string, w: number): FurnitureDef {
  return {
    id,
    name: id,
    category: 'electronics',
    kind: 'parametric',
    primitive: 'FlatscreenTV',
    defaultFootprint: { w, d: 0.08, h: w * 0.6 },
    paramSchema: [
      {
        kind: 'enum',
        key: 'screenContent',
        label: 'Screen',
        default: 'landscape',
        options: [{ value: 'landscape', label: 'Landscape' }],
      },
    ],
  } as unknown as FurnitureDef
}

const defs: Record<string, FurnitureDef> = {
  'sofa-3seat': def('sofa-3seat', 2.1, 0.9),
  armchair: def('armchair', 0.8, 0.8),
  // A 1.66 m wide 16:9 panel = 75" diagonal, matching the shipped `tv-wall`;
  // its band is 2.29-3.05 m at 1.2-1.6x diagonal.
  'flatscreen-tv': tvDef('flatscreen-tv', 1.66),
  // Kept so the console can be asserted NOT to be measured as a screen.
  'tv-console': def('tv-console', 1.4, 0.4),
  'coffee-table': def('coffee-table', 1.1, 0.55),
}

const find = (c: ReturnType<typeof buildLayoutCritique>, id: string) =>
  c.findings.find((f) => f.id === id)!

describe('buildLayoutCritique — TV viewing distance', () => {
  it('passes a seat inside the published 2.4-3.7 m band', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('s', 'sofa-3seat', 3, 1), item('t', 'flatscreen-tv', 3, 4)],
      defs,
    )
    expect(find(c, 'tv-distance').verdict).toBe('pass')
    expect(find(c, 'tv-distance').detail).toContain('3.00 m')
  })

  it('warns when the seat is too close to the screen', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('s', 'sofa-3seat', 3, 3), item('t', 'flatscreen-tv', 3, 4)],
      defs,
    )
    expect(find(c, 'tv-distance').verdict).toBe('warn')
  })

  it('measures to the NEAREST seat, not an arbitrary one', () => {
    const c = buildLayoutCritique(
      plan(),
      [
        item('far', 'sofa-3seat', 3, 0.5),
        item('near', 'armchair', 3, 3.9),
        item('t', 'flatscreen-tv', 3, 4),
      ],
      defs,
    )
    // The armchair at 0.1 m is nearest, so this must warn, not pass on the sofa.
    expect(find(c, 'tv-distance').verdict).toBe('warn')
  })

  it('skips rather than fails when there is no TV', () => {
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 1)], defs)
    expect(find(c, 'tv-distance').verdict).toBe('skipped')
  })
})

describe('buildLayoutCritique — conversation grouping', () => {
  it('passes seats within the 1.8-2.4 m ideal band', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)],
      defs,
    )
    expect(find(c, 'conversation').verdict).toBe('pass')
  })

  it('FAILS past the 3.05 m breakdown distance, with the reason stated', () => {
    const c = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 1, 2.5), item('b', 'armchair', 5, 2.5)],
      defs,
    )
    const f = find(c, 'conversation')
    expect(f.verdict).toBe('fail')
    expect(f.detail).toMatch(/cannot hold one conversation/)
  })

  it('measures the WIDEST pair — that spread is what breaks a group', () => {
    const c = buildLayoutCritique(
      plan(),
      [
        item('a', 'sofa-3seat', 1, 2.5),
        item('b', 'armchair', 2, 2.5),
        item('cc', 'armchair', 5, 2.5),
      ],
      defs,
    )
    expect(find(c, 'conversation').verdict).toBe('fail')
  })

  it('skips with fewer than two seats in a room', () => {
    const c = buildLayoutCritique(plan(), [item('a', 'sofa-3seat', 3, 3)], defs)
    expect(find(c, 'conversation').verdict).toBe('skipped')
  })
})

describe('buildLayoutCritique — coffee table and proportion', () => {
  it('skips the table check when none is placed', () => {
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 3)], defs)
    expect(find(c, 'coffee-table').verdict).toBe('skipped')
  })

  it('warns a sofa above the cited SG 3-seater band, and says why', () => {
    const wide = { ...defs, 'sofa-big': def('sofa-big', 2.6, 0.9) }
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-big', 3, 3)], wide)
    const f = find(c, 'sofa-proportion')
    expect(f.verdict).toBe('warn')
    expect(f.detail).toContain('2.60 m wide')
    expect(f.detail).toMatch(/eat the room/)
  })

  it('passes a sofa inside the SG band', () => {
    // 2.10 m — squarely inside the 1.75-2.20 m typical range.
    const c = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 3)], defs)
    expect(find(c, 'sofa-proportion').verdict).toBe('pass')
  })

  it('judges sofa size on ABSOLUTE width, not a ratio to the room', () => {
    // The same sofa in a tiny room and a large one must read the same: the SG
    // sources give a width band, not a proportion, and a ratio warned on
    // essentially every SG scheme.
    const small = buildLayoutCritique(
      {
        ...plan(),
        rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 3, depth: 3 }],
      } as never,
      [item('s', 'sofa-3seat', 1.5, 1.5)],
      defs,
    )
    const large = buildLayoutCritique(plan(), [item('s', 'sofa-3seat', 3, 3)], defs)
    expect(find(small, 'sofa-proportion').verdict).toBe(find(large, 'sofa-proportion').verdict)
  })
})

describe('buildLayoutCritique — scoring', () => {
  it('scores only the checks that APPLIED, so a sparse room is not penalised', () => {
    const c = buildLayoutCritique(plan(), [], defs)
    expect(c.applied).toBe(0)
    // 100 means "no evidence of a problem", not "perfect" — documented.
    expect(c.score).toBe(100)
  })

  it('a failing check drags the score below a warning one', () => {
    const good = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)],
      defs,
    )
    const bad = buildLayoutCritique(
      plan(),
      [item('a', 'sofa-3seat', 1, 2.5), item('b', 'armchair', 5, 2.5)],
      defs,
    )
    expect(bad.score).toBeLessThan(good.score)
  })

  it('is deterministic', () => {
    const items = [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 4, 2.5)]
    expect(buildLayoutCritique(plan(), items, defs)).toEqual(
      buildLayoutCritique(plan(), items, defs),
    )
  })

  it('exposes its thresholds so a caller can cite them', () => {
    expect(CRITIQUE.tvDiagonalMin).toBe(1.2)
    expect(CRITIQUE.convBreakdown).toBe(3.05)
    expect(CRITIQUE.tableMin).toBe(0.36)
  })

  it('never throws on a malformed def or an item outside every room', () => {
    expect(() =>
      buildLayoutCritique(
        plan(),
        [item('x', 'nope', 99, 99), item('s', 'sofa-3seat', 99, 99)],
        defs,
      ),
    ).not.toThrow()
  })
})

/**
 * Storage access (v0.31.8.8). `CLEARANCE.storageFront` (0.75 m) is tabulated in
 * `docs/interior-design-guidelines.md` as a rule the app follows and had NO
 * consumer anywhere in the codebase until this check. It is REPORTED, not
 * enforced — making the arranger honour it was tried in v0.31.8.7 and measured
 * worse.
 *
 * The directional arms are the ones that matter: a piece beside or behind a
 * wardrobe does not stop its door opening, and a check that cannot tell the
 * difference would warn on almost every correct bedroom.
 */
describe('buildLayoutCritique — storage access', () => {
  /** A hinged wardrobe: 1.4 m wide, 0.6 m deep, front faces local +Z. */
  const wardrobe: FurnitureDef = {
    id: 'wardrobe-3door',
    name: 'Wardrobe',
    category: 'storage',
    kind: 'parametric',
    primitive: 'Wardrobe',
    defaultFootprint: { w: 1.4, d: 0.6, h: 2.1 },
  } as unknown as FurnitureDef
  const blocker: FurnitureDef = {
    id: 'bed-queen',
    name: 'Bed',
    category: 'beds',
    kind: 'primitive',
    defaultFootprint: { w: 1.5, d: 2.0, h: 0.5 },
  } as unknown as FurnitureDef
  const storeDefs: Record<string, FurnitureDef> = {
    'wardrobe-3door': wardrobe,
    'bed-queen': blocker,
  }

  /** Wardrobe at the room's north edge facing +Z (into the room). */
  const wd = () => item('wd', 'wardrobe-3door', 3, 0.3)
  /** Bed centred `gap` metres in front of the wardrobe's front face (z=0.6). */
  const bedInFront = (gap: number) => item('bd', 'bed-queen', 3, 0.6 + gap + 1.0)

  it('passes when the recommended clearance is there', () => {
    const c = buildLayoutCritique(plan(), [wd(), bedInFront(1.2)], storeDefs)
    const f = find(c, 'storage-access')
    expect(f.verdict).toBe('pass')
    expect(f.detail).toMatch(/0\.75 m clear in front/)
  })

  it('warns, naming the piece, its room and its actual clearance', () => {
    const c = buildLayoutCritique(plan(), [wd(), bedInFront(0.2)], storeDefs)
    const f = find(c, 'storage-access')
    expect(f.verdict).toBe('warn')
    expect(f.detail).toMatch(/Wardrobe has 0\.20 m clear in front/)
    // A contractor reading "0.20 m clear" needs to know WHICH wardrobe.
    expect(f.roomName).toBe('Living')
  })

  it('does not attribute a PASS to one room — it is a whole-home statement', () => {
    const f = find(
      buildLayoutCritique(plan(), [wd(), bedInFront(1.2)], storeDefs),
      'storage-access',
    )
    expect(f.verdict).toBe('pass')
    expect(f.roomName).toBeUndefined()
  })

  it('ignores a piece BEHIND the wardrobe — its door does not open backwards', () => {
    // Bed north of the wardrobe (behind its back), 0.05 m away.
    const c = buildLayoutCritique(
      plan(),
      [item('wd', 'wardrobe-3door', 3, 2.0), item('bd', 'bed-queen', 3, 0.65)],
      storeDefs,
    )
    expect(find(c, 'storage-access').verdict).toBe('pass')
  })

  it('ignores a piece OFF TO THE SIDE even though it is further into the room', () => {
    // This fixture is built so the WIDTH-OVERLAP gate is the only thing that can
    // pass it. The bed is genuinely in front in the +Z sense (its near edge is
    // 0.4 m past the wardrobe's front face, so the in-front gate admits it) but
    // sits laterally clear of the wardrobe's 1.4 m width span, so nothing blocks
    // the door. An earlier version of this test put the bed alongside at the
    // same z, where the IN-FRONT gate excluded it — the width gate was never
    // reached, and removing that gate did not fail a single test.
    const c = buildLayoutCritique(
      plan(),
      [item('wd', 'wardrobe-3door', 1.0, 0.3), item('bd', 'bed-queen', 4.0, 2.0)],
      storeDefs,
    )
    expect(find(c, 'storage-access').verdict).toBe('pass')
  })

  it('reads the FRONT from rotation, not from a fixed axis', () => {
    // Same pair, rotated a quarter turn: wardrobe faces +X, bed sits +X of it.
    const rot = (it: FurnitureItem, r: number) => ({ ...it, rotation: r })
    const c = buildLayoutCritique(
      plan(),
      [
        rot(item('wd', 'wardrobe-3door', 0.3, 2.5), Math.PI / 2),
        item('bd', 'bed-queen', 0.3 + 0.3 + 0.2 + 1.0, 2.5),
      ],
      storeDefs,
    )
    expect(find(c, 'storage-access').verdict).toBe('warn')
  })

  it('skips when there is no openable storage — a nightstand is not the subject', () => {
    // Category 'storage' but not an openable-cabinet primitive: the first cut of
    // this check selected on category and warned on nightstands, which are
    // reached from the bed and have no published standing-room requirement.
    const nightstand = {
      ...wardrobe,
      id: 'nightstand',
      name: 'Nightstand',
      primitive: 'Nightstand',
      defaultFootprint: { w: 0.45, d: 0.4, h: 0.55 },
    } as unknown as FurnitureDef
    const c = buildLayoutCritique(
      plan(),
      [item('ns', 'nightstand', 3, 0.3), item('bd', 'bed-queen', 3, 1.2)],
      { nightstand, 'bed-queen': blocker },
    )
    expect(find(c, 'storage-access').verdict).toBe('skipped')
  })
})

/**
 * Bed access (v0.31.8.11). `CLEARANCE.bedSurround` (0.6 m) existed only as a
 * soft scoring penalty inside the auto-arranger and was never reported. Published
 * as 24 inches: "the minimum recommended walking clearance alongside a bed is 24
 * inches (about 61 cm)".
 *
 * ONE long side is enough, per "for walking space on any side you use to get in
 * and out" — a single bed in a corner is a normal small-room answer, not a defect.
 */
describe('buildLayoutCritique — bed access', () => {
  const bed: FurnitureDef = {
    id: 'bed-queen',
    name: 'Bed',
    category: 'beds',
    kind: 'primitive',
    defaultFootprint: { w: 1.5, d: 2.0, h: 0.5 },
  } as unknown as FurnitureDef
  /** 0.9 m² — a real circulation obstacle. */
  const wardrobe: FurnitureDef = {
    id: 'wardrobe-3door',
    name: 'Wardrobe',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 1.5, d: 0.6, h: 2.1 },
  } as unknown as FurnitureDef
  /** 0.18 m² — something you step past, not a walkway boundary. */
  const nightstand: FurnitureDef = {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 0.45, d: 0.4, h: 0.55 },
  } as unknown as FurnitureDef
  const bedDefs: Record<string, FurnitureDef> = {
    'bed-queen': bed,
    'wardrobe-3door': wardrobe,
    nightstand,
  }
  const access = (items: FurnitureItem[]) =>
    find(buildLayoutCritique(plan(), items, bedDefs), 'bed-access')

  // Bed centred at x=1.5 in a 6x5 room: its side faces sit at x=0.75 and x=2.25.
  const bd = () => item('bd', 'bed-queen', 1.5, 2.5)

  it('passes when a long side has the recommended walking clearance', () => {
    expect(access([bd()]).verdict).toBe('pass')
  })

  it('warns when BOTH long sides are blocked by real obstacles', () => {
    // Wardrobes 0.2 m off each side face (their 0.6 m depth faces the bed).
    const f = access([
      bd(),
      { ...item('w1', 'wardrobe-3door', 0.75 - 0.2 - 0.3, 2.5), rotation: Math.PI / 2 },
      { ...item('w2', 'wardrobe-3door', 2.25 + 0.2 + 0.3, 2.5), rotation: Math.PI / 2 },
    ])
    expect(f.verdict).toBe('warn')
    expect(f.detail).toMatch(/roomiest side of this bed is 0\.20 m/)
    expect(f.roomName).toBe('Living')
  })

  it('needs only ONE clear side — a bed against a wall on one side passes', () => {
    // Only the west side blocked; the east side is open floor.
    expect(
      access([
        bd(),
        { ...item('w1', 'wardrobe-3door', 0.75 - 0.2 - 0.3, 2.5), rotation: Math.PI / 2 },
      ]).verdict,
    ).toBe('pass')
  })

  it('does NOT count a NIGHTSTAND as blocking the bedside', () => {
    // The false alarm this check shipped with for one measurement round: the
    // AUTHORED default flat warned at 0.24 m, which was the gap from the bed's
    // side face to its own nightstand. A bedside table is part of the bedside
    // arrangement — you step past it. Remove the walkway-area filter and this
    // test fails.
    const f = access([
      bd(),
      item('n1', 'nightstand', 0.75 - 0.1 - 0.225, 2.5),
      item('n2', 'nightstand', 2.25 + 0.1 + 0.225, 2.5),
    ])
    expect(f.verdict).toBe('pass')
  })

  it('reads the bed SIDES from its rotation, not from a fixed axis', () => {
    // Quarter-turned bed: its long sides now face ±Z, so blockers must be
    // north/south of it to count. A check keyed to a fixed axis would miss these.
    const rotBed = { ...item('bd', 'bed-queen', 3, 2.5), rotation: Math.PI / 2 }
    const f = access([
      rotBed,
      { ...item('w1', 'wardrobe-3door', 3, 2.5 - 0.75 - 0.2 - 0.3), rotation: 0 },
      { ...item('w2', 'wardrobe-3door', 3, 2.5 + 0.75 + 0.2 + 0.3), rotation: 0 },
    ])
    expect(f.verdict).toBe('warn')
    expect(f.detail).toMatch(/0\.20 m/)
  })

  it('skips when there is no bed', () => {
    expect(access([]).verdict).toBe('skipped')
  })
})

/**
 * **TV viewing distance is size-dependent, and the TV selector was wrong in both
 * directions (v0.31.8.19).**
 *
 * The band was a flat 2.4–3.7 m from "position seating around 8 to 12 feet from
 * the television", which ignores screen size even though the app knows every
 * screen's width. The industry figures are angular, as diagonal multipliers:
 * ~1.2x (THX/immersive, ~40°) to ~1.6x (SMPTE/relaxed, ~30°). Cross-checked: a
 * 55" 4K is published at 5.5 ft THX / 7.3 ft SMPTE = 1.68–2.23 m, and 1.2–1.6x a
 * 55" diagonal gives 1.68–2.24 m.
 *
 * And `TV_RE = /^tv/` matched `tv-console` — a media console with NO screen — while
 * MISSING `flatscreen-tv`, an actual TV. One name regex measured furniture and
 * ignored a real TV.
 */
describe('buildLayoutCritique — TV viewing distance is size-dependent', () => {
  const tvAt = (screenW: number, seatDistance: number) => {
    const local: Record<string, FurnitureDef> = {
      ...defs,
      'flatscreen-tv': tvDef('flatscreen-tv', screenW),
    }
    const items = [
      item('tv', 'flatscreen-tv', 3, 0.5),
      item('s', 'sofa-3seat', 3, 0.5 + seatDistance),
    ]
    return find(buildLayoutCritique(plan(), items, local), 'tv-distance')
  }

  it('passes a 55" TV at 2.0 m, which the old flat band called too close', () => {
    // 55" => 1.397 m diagonal => 1.68–2.24 m. The old 2.4 m lower bound warned
    // here, telling a user their correctly-placed TV was too near.
    const f = tvAt(1.218, 2.0)
    expect(f.verdict).toBe('pass')
    expect(f.detail).toMatch(/55" screen wants 1\.6\d–2\.2\d m/)
  })

  it('warns the SAME 2.0 m distance for a 75" TV', () => {
    // 75" => 1.905 m diagonal => 2.29–3.05 m. Identical geometry, different
    // verdict — which is the whole point of making the band size-dependent.
    expect(tvAt(1.66, 2.0).verdict).toBe('warn')
  })

  it('warns when the seat is too FAR for a small screen', () => {
    // 3.2 m from a 55" TV is past even the relaxed 1.6x bound. A flat band with
    // a 3.7 m ceiling passed this.
    expect(tvAt(1.218, 3.2).verdict).toBe('warn')
  })

  it('does NOT measure a tv-console — it has no screen', () => {
    // The old `/^tv/` selector reported a viewing distance to this console.
    const f = find(
      buildLayoutCritique(
        plan(),
        [item('c', 'tv-console', 3, 0.5), item('s', 'sofa-3seat', 3, 3.0)],
        defs,
      ),
      'tv-distance',
    )
    expect(f.verdict).toBe('skipped')
  })

  it('DOES measure flatscreen-tv, which the old selector missed entirely', () => {
    expect(tvAt(1.66, 2.6).verdict).toBe('pass')
  })
})

/**
 * **Lounge seating comes from the arrange ROLE, not a name regex
 * (v0.31.8.20).** `SEATING_RE = /^(sofa|armchair)/` missed `recliner`,
 * `chaise-lounge`, `banquette`, `bay-daybed` and `ottoman`, so a living room
 * furnished with a recliner and a TV reported "No TV and seating pair in one room
 * to measure" — a silent SKIP of an ordinary lounge, which is worse than a wrong
 * number because nothing prompts the reader to look.
 */
describe('buildLayoutCritique — lounge seating selection', () => {
  const seatDef = (id: string, role: 'lounge' | 'dining'): FurnitureDef =>
    ({
      id,
      name: id,
      category: role === 'lounge' ? 'seating' : 'seating',
      kind: 'primitive',
      defaultFootprint: { w: 0.9, d: 0.9, h: 0.8 },
    }) as unknown as FurnitureDef

  // Real catalogue ids, so `roleOf` resolves them through the real ROLE table
  // rather than through a fixture that could disagree with it.
  const local: Record<string, FurnitureDef> = {
    ...defs,
    'flatscreen-tv': tvDef('flatscreen-tv', 1.66),
    recliner: seatDef('recliner', 'lounge'),
    'dining-chair': seatDef('dining-chair', 'dining'),
    ottoman: seatDef('ottoman', 'lounge'),
  }

  it('measures a recliner as a seat — the regex skipped the whole room', () => {
    const f = find(
      buildLayoutCritique(
        plan(),
        [item('tv', 'flatscreen-tv', 3, 0.3), item('rc', 'recliner', 3, 2.9)],
        local,
      ),
      'tv-distance',
    )
    expect(f.verdict).not.toBe('skipped')
    expect(f.verdict).toBe('pass')
  })

  it('does NOT treat a dining chair as lounge seating', () => {
    // `dining-chair` is role `diningChair`; the cited "6-8 feet between facing
    // seats" band is about lounge seating, and a dining chair near the TV would
    // otherwise become the "nearest seat".
    const f = find(
      buildLayoutCritique(
        plan(),
        [item('tv', 'flatscreen-tv', 3, 0.3), item('dc', 'dining-chair', 3, 1.0)],
        local,
      ),
      'tv-distance',
    )
    expect(f.verdict).toBe('skipped')
  })

  it('does NOT let an ottoman become the nearest seat', () => {
    // Measured: a sofa at a correct 2.60 m plus a footstool at 1.60 m flips the
    // room to a warn if the ottoman counts. It sits BETWEEN sofa and TV, so it
    // understates the viewing distance rather than representing a viewing spot.
    const f = find(
      buildLayoutCritique(
        plan(),
        [
          item('tv', 'flatscreen-tv', 3, 0.3),
          item('sf', 'sofa-3seat', 3, 2.9),
          item('ot', 'ottoman', 3, 1.9),
        ],
        local,
      ),
      'tv-distance',
    )
    expect(f.verdict).toBe('pass')
    expect(f.detail).toMatch(/^2\.60 m/)
  })
})

/**
 * **The conversation warning fires outside Hall's SOCIAL space, not outside the
 * ideal (v0.31.8.20).** Edward T. Hall's proxemics puts social space at 4-10
 * feet and personal space at 2-4 feet, so 1.22 m is where facing seats stop
 * being sociable and 3.05 m is where social space ends — `convBreakdown` was
 * already the 10 ft bound, and the lower bound now comes from the same source
 * instead of from the 6 ft ideal.
 *
 * Measured: of six "too close" warnings across the shipped templates, four were
 * at 1.33-1.79 m — inside Hall's social range, all in a studio, 1-bed, condo
 * studio or terrace, where that spacing IS the right answer for the room. Only
 * 1.08 m and 1.16 m were genuinely in personal space.
 */
describe('buildLayoutCritique — conversation uses social space, not the ideal', () => {
  const twoSeats = (apart: number) =>
    find(
      buildLayoutCritique(
        plan(),
        [item('a', 'sofa-3seat', 2, 2.5), item('b', 'armchair', 2 + apart, 2.5)],
        defs,
      ),
      'conversation',
    )

  it('passes 1.5 m — close, but normal social distance in a small home', () => {
    // The regression this fixes: the old bar warned here because 1.5 < the 6 ft
    // ideal, which described the housing stock rather than the design.
    const f = twoSeats(1.5)
    expect(f.verdict).toBe('pass')
  })

  it('warns below the 1.2 m social floor, which is personal space', () => {
    const f = twoSeats(1.0)
    expect(f.verdict).toBe('warn')
    expect(f.detail).toMatch(/closer than the 1\.2 m social minimum/)
  })

  it('still passes the ideal band and quotes it', () => {
    const f = twoSeats(2.2)
    expect(f.verdict).toBe('pass')
    expect(f.detail).toMatch(/ideal 1\.8–2\.4 m/)
  })

  it('still warns beyond the ideal but inside social space', () => {
    expect(twoSeats(2.8).verdict).toBe('warn')
  })

  it('still FAILS past the 10 ft social bound', () => {
    // Unchanged, and the strongest claim the check makes — 3.05 m is Hall's
    // upper social bound, so beyond it a single conversation really does break.
    const f = twoSeats(4.0)
    expect(f.verdict).toBe('fail')
    expect(f.detail).toMatch(/cannot hold one conversation/)
  })
})
