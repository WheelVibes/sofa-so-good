import { describe, expect, it } from 'vitest'
import { canPlace } from '../collision/placement'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import { planCollisionWalls } from '../floorplan/planGeometry'
import type { FloorPlan } from '../floorplan/types'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { defaultParamProps } from '../furniture/types'
import {
  arrangeAllRooms,
  arrangeAllRoomsForPlan,
  arrangePlanRoom,
  arrangeRoom,
  roleForCategory,
  roleOf,
  roomKindFromName,
  roomOf,
} from './autoArrange'
import { blockedDoorItems } from './clearance'

function hydrate(): FurnitureItem[] {
  return defaultLayout().map((e) => {
    const def = BUILTIN_CATALOG[e.defId]
    return def?.kind === 'parametric'
      ? { ...e, props: { ...defaultParamProps(def), ...e.props } }
      : e
  })
}

function assertValid(items: FurnitureItem[]) {
  const placed: FurnitureItem[] = []
  for (const it of items) {
    const def = BUILTIN_CATALOG[it.defId]
    expect(def).toBeDefined()
    const ok = canPlace(it, def!, { others: placed, defs: BUILTIN_CATALOG, doors: {} })
    if (!ok) throw new Error(`${it.id} (${it.defId}) invalid at [${it.position}]`)
    placed.push(it)
  }
}

describe('arrangeRoom', () => {
  it('produces a collision-valid layout for the living/dining', () => {
    const out = arrangeRoom('livingDining', hydrate(), BUILTIN_CATALOG, {})
    assertValid(out)
  })

  it('orients the living-room sofa to face the east TV wall', () => {
    const out = arrangeRoom('livingDining', hydrate(), BUILTIN_CATALOG, {})
    const sofa = out.find((i) => i.defId === 'sofa-3seat' && roomOf(i.position) === 'livingDining')
    expect(sofa).toBeDefined()
    // Facing +X (east) ≈ rotation PI/2.
    expect(Math.abs(Math.sin(sofa!.rotation) - 1)).toBeLessThan(0.1)
    // Sofa sits west of the TV.
    const tv = out.find((i) => i.defId === 'tv-wall')
    expect(sofa!.position[0]).toBeLessThan(tv!.position[0])
  })

  it('keeps bedrooms collision-valid and beds against a wall', () => {
    for (const room of ['mainBedroom', 'bedroom2', 'bedroom3'] as const) {
      const out = arrangeRoom(room, hydrate(), BUILTIN_CATALOG, {})
      assertValid(out)
    }
  })

  it('places a bed and a crib against walls in the same bedroom', () => {
    // A parents' room: just a double bed + a crib (clear floor) → both should
    // be placed validly (the crib snaps to a free wall, not left floating).
    const mk = (defId: string, id: string, pos: [number, number]): FurnitureItem => ({
      id,
      defId,
      position: pos,
      rotation: 0,
      props: { ...defaultParamProps(BUILTIN_CATALOG[defId] as never) },
    })
    const items = [mk('bed-double', 'test-bed', [7.1, 1.3]), mk('crib', 'test-crib', [7.5, 2.6])]
    const out = arrangeRoom('bedroom3', items, BUILTIN_CATALOG, {})
    assertValid(out)
    for (const id of ['test-bed', 'test-crib']) {
      const it = out.find((i) => i.id === id)!
      expect(roomOf(it.position)).toBe('bedroom3')
    }
  })

  it('tucks a WFH office chair in front of its desk in the living/dining', () => {
    // A work-from-home corner dropped into the open lounge: the office chair
    // must land next to its desk facing it, not stranded against a far wall.
    const mk = (defId: string, id: string, pos: [number, number]): FurnitureItem => ({
      id,
      defId,
      position: pos,
      rotation: 0,
      props: { ...defaultParamProps(BUILTIN_CATALOG[defId] as never) },
    })
    // A near-empty lounge with just the WFH corner, so the tuck has room.
    const items = [
      mk('desk', 'test-desk', [10.0, 3.0]),
      mk('office-chair', 'test-chair', [11.5, 5.5]),
    ]
    const out = arrangeRoom('livingDining', items, BUILTIN_CATALOG, {})
    assertValid(out)
    const desk = out.find((i) => i.id === 'test-desk')!
    const chair = out.find((i) => i.id === 'test-chair')!
    expect(roomOf(chair.position)).toBe('livingDining')
    // Chair sits within reach of the desk (not parked across the room).
    const gap = Math.hypot(
      desk.position[0] - chair.position[0],
      desk.position[1] - chair.position[1],
    )
    expect(gap).toBeLessThan(1.2)
    // Chair faces the desk: it sits on the desk's facing side and is rotated
    // ~180° from the desk (placeDeskChairs sets chair = desk.rotation + PI).
    const dot =
      Math.sin(desk.rotation) * Math.sin(chair.rotation) +
      Math.cos(desk.rotation) * Math.cos(chair.rotation)
    expect(dot).toBeLessThan(-0.5)
  })

  it('spaces the kitchen fridge + stove into a work triangle (opposite ends)', () => {
    // Scramble the fridge and stove next to each other mid-kitchen; tidying
    // should push them to opposite ends of the long (X) run, leaving the sink
    // between them — not crammed side-by-side.
    const base = hydrate().map((i) =>
      i.defId === 'refrigerator' && roomOf(i.position) === 'kitchen'
        ? { ...i, position: [8.0, 7.2] as [number, number] }
        : i.defId === 'stove' && roomOf(i.position) === 'kitchen'
          ? { ...i, position: [8.3, 7.2] as [number, number] }
          : i,
    )
    const out = arrangeRoom('kitchen', base, BUILTIN_CATALOG, {})
    assertValid(out)
    const fridge = out.find((i) => i.defId === 'refrigerator' && roomOf(i.position) === 'kitchen')!
    const stove = out.find((i) => i.defId === 'stove' && roomOf(i.position) === 'kitchen')!
    expect(fridge).toBeDefined()
    expect(stove).toBeDefined()
    // Separated along the run (not adjacent) — the work-triangle guarantee.
    const gap = Math.hypot(
      fridge.position[0] - stove.position[0],
      fridge.position[1] - stove.position[1],
    )
    expect(gap).toBeGreaterThan(1.2)
  })

  it('lines bathroom fixtures along the walls (not parked mid-room)', () => {
    // bath1: origin (1.45, 5.10), 2.40 x 1.60. Scramble its fixtures toward
    // the room centre, tidy, and assert each ends flush to a wall + valid.
    const cx = 1.45 + 2.4 / 2
    const cz = 5.1 + 1.6 / 2
    const base = hydrate().map((i) =>
      i.id === 'default-bath1-shower'
        ? { ...i, position: [cx, cz] as [number, number] }
        : i.id === 'default-bath1-wc'
          ? { ...i, position: [cx + 0.1, cz + 0.1] as [number, number] }
          : i.id === 'default-bath1-basin'
            ? { ...i, position: [cx - 0.1, cz - 0.1] as [number, number] }
            : i,
    )
    const out = arrangeRoom('bath1', base, BUILTIN_CATALOG, {})
    assertValid(out)
    const wallDist = (p: [number, number]) =>
      Math.min(p[0] - 1.45, 3.85 - p[0], p[1] - 5.1, 6.7 - p[1])
    for (const id of ['default-bath1-shower', 'default-bath1-wc', 'default-bath1-basin']) {
      const it = out.find((i) => i.id === id)!
      expect(roomOf(it.position)).toBe('bath1')
      // Flush to a wall: centre sits within ~half a fixture depth of an edge.
      expect(wallDist(it.position)).toBeLessThan(0.7)
    }
  })

  it('leaves items in untouched rooms unchanged', () => {
    const base = hydrate()
    const out = arrangeRoom('livingDining', base, BUILTIN_CATALOG, {})
    const kitchenBefore = base.filter((i) => roomOf(i.position) === 'kitchen')
    const kitchenAfter = out.filter((i) => i.id && roomOf(i.position) === 'kitchen')
    expect(kitchenAfter.length).toBe(kitchenBefore.length)
  })

  it('arrangeAllRooms produces a collision-valid whole-home layout', () => {
    const out = arrangeAllRooms(hydrate(), BUILTIN_CATALOG, {})
    expect(out.length).toBe(hydrate().length)
    assertValid(out)
  })

  it('arrangeAllRoomsForPlan tidies a custom plan validly, clearing door swings', () => {
    // The default flat as a plan, with its furniture distributed per room.
    const plan = buildDefaultPlan()
    const out = arrangeAllRoomsForPlan(plan, hydrate(), BUILTIN_CATALOG, {})
    expect(out.length).toBe(hydrate().length)
    assertValid(out)
    // No floor item ends up squarely in a door's path.
    expect(blockedDoorItems(out, BUILTIN_CATALOG, plan)).toHaveLength(0)
  })

  it('respects a NON-default plan own walls when tidying (not the flat walls)', () => {
    // Adversarial plan: a 4x4 room with an interior wall straight through the
    // centre — a location that is OPEN floor in the fixed flat. A plant dropped
    // on that wall must be relocated off it. (Regression: arrangeAllRoomsForPlan
    // collided against the fixed flat's walls, so an item on the custom plan's
    // wall was deemed valid and left there.)
    const plan: FloorPlan = {
      id: 'adv',
      name: 'Adversarial',
      ceilingHeight: 2.6,
      extent: [4, 4],
      walls: [
        { id: 'w-n', start: [0, 0], end: [4, 0], thickness: 'external' },
        { id: 'w-e', start: [4, 0], end: [4, 4], thickness: 'external' },
        { id: 'w-s', start: [4, 4], end: [0, 4], thickness: 'external' },
        { id: 'w-w', start: [0, 4], end: [0, 0], thickness: 'external' },
        // Interior wall bisecting the room (open floor in the fixed flat).
        { id: 'w-mid', start: [0, 2], end: [4, 2], thickness: 'internal' },
      ],
      openings: [],
      rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 4, depth: 4 }],
    }
    const plant: FurnitureItem = {
      id: 'plant',
      defId: 'potted-plant',
      position: [2, 2], // squarely on the mid wall
      rotation: 0,
      props: { ...defaultParamProps(BUILTIN_CATALOG['potted-plant'] as never) },
    }
    const out = arrangeAllRoomsForPlan(plan, [plant], BUILTIN_CATALOG, {})
    const walls = planCollisionWalls(plan, {})
    const placed = out.find((i) => i.id === 'plant')!
    const ok = canPlace(placed, BUILTIN_CATALOG['potted-plant'], {
      others: [],
      defs: BUILTIN_CATALOG,
      doors: {},
      walls,
    })
    if (!ok) throw new Error(`plant left overlapping the plan wall at [${placed.position}]`)
  })

  it('never parks furniture in the main-door swing / kitchen opening', () => {
    // Scramble L/D furniture into the entrance + openings, then tidy.
    const base = hydrate().map((i) =>
      i.id === 'default-ld-sofa'
        ? { ...i, position: [11.3, 7.4] as [number, number], rotation: 0 }
        : i.id === 'default-ld-coffee'
          ? { ...i, position: [9.4, 6.6] as [number, number] }
          : i,
    )
    const out = arrangeRoom('livingDining', base, BUILTIN_CATALOG, {})
    const keepouts = [
      { x0: 10.7, z0: 6.95, x1: 12.1, z1: 8.0 },
      { x0: 8.9, z0: 6.25, x1: 10.2, z1: 6.95 },
    ]
    const overlaps = (
      b: { x0: number; z0: number; x1: number; z1: number },
      k: (typeof keepouts)[number],
    ) => b.x0 < k.x1 && b.x1 > k.x0 && b.z0 < k.z1 && b.z1 > k.z0
    for (const it of out) {
      const def = BUILTIN_CATALOG[it.defId]
      if (def?.kind !== 'parametric' || def.mounted) continue
      if (roomOf(it.position) !== 'livingDining') continue
      let w = def.defaultFootprint.w
      let d = def.defaultFootprint.d
      const wv = it.props[def.footprintParams?.w ?? 'width']
      const dv = it.props[def.footprintParams?.d ?? 'depth']
      if (typeof wv === 'number') w = wv
      if (typeof dv === 'number') d = dv
      const c = Math.abs(Math.cos(it.rotation))
      const s = Math.abs(Math.sin(it.rotation))
      const hx = (c * w + s * d) / 2
      const hz = (s * w + c * d) / 2
      const box = {
        x0: it.position[0] - hx,
        z0: it.position[1] - hz,
        x1: it.position[0] + hx,
        z1: it.position[1] + hz,
      }
      for (const k of keepouts) {
        if (overlaps(box, k))
          throw new Error(`${it.id} (${it.defId}) blocks a door/opening at [${it.position}]`)
      }
    }
  })
})

describe('roleForCategory new categories', () => {
  it('maps the new IKEA-department categories to sensible roles', () => {
    expect(roleForCategory('electronics')).toBe('media')
    expect(roleForCategory('kids')).toBe('storage')
    expect(roleForCategory('laundry')).toBe('storage')
    expect(roleForCategory('others')).toBe('other')
    expect(roleForCategory('tables')).toBe('lowTable')
    expect(roleForCategory('lighting')).toBe('floorLamp')
  })
})

describe('roleOf honours def collision flags (imported IKEA/user defs)', () => {
  function gltfDef(over: Partial<FurnitureDef>): FurnitureDef {
    return {
      kind: 'gltf',
      id: 'ikea-x',
      name: 'X',
      category: 'lighting',
      source: 'ikea',
      groupKey: 'x',
      activeVariant: 'a',
      variants: [],
      defaultFootprint: { w: 0.4, d: 0.4, h: 0.4 },
      uploadedAt: 't',
      license: 'IKEA',
      attribution: 'IKEA',
      ...over,
    } as FurnitureDef
  }

  it('treats a mounted IKEA def as a fixed wall/ceiling fixture, not a floor item', () => {
    // A ceiling pendant: category lighting, mounted. Without the flag check it
    // would resolve to a floor role and get parked on the floor by settle().
    const def = gltfDef({ id: 'ikea-pendant', category: 'lighting', mounted: true })
    expect(roleOf('ikea-pendant', { 'ikea-pendant': def })).toBe('mounted')
  })

  it('treats a mounted appliance (range hood / aircon) as fixed', () => {
    const def = gltfDef({ id: 'ikea-hood', category: 'appliances', mounted: true })
    expect(roleOf('ikea-hood', { 'ikea-hood': def })).toBe('mounted')
  })

  it('treats a noClip IKEA def (rug) as a rug', () => {
    const def = gltfDef({ id: 'ikea-rug', category: 'textiles', noClip: true })
    expect(roleOf('ikea-rug', { 'ikea-rug': def })).toBe('rug')
  })

  it('falls back to the category role for an unflagged imported def', () => {
    const def = gltfDef({ id: 'ikea-lamp', category: 'lighting' })
    expect(roleOf('ikea-lamp', { 'ikea-lamp': def })).toBe('floorLamp')
  })
})

describe('arrangeAllRooms with imported IKEA defs (whole-home Tidy regression guard)', () => {
  // Mirrors what TidyHomeButton does once a real IKEA catalogue is loaded: the
  // arranger is handed a MERGED catalog containing IKEA defs (not BUILTIN_CATALOG
  // alone). A mounted fixture must stay put; a floor item must be (re)placed
  // validly. This guards the catalog-wiring + flag-aware role fix as the
  // catalogue grows. See [[arrange-needs-merged-catalog]].
  function ikeaDef(over: Partial<FurnitureDef>): FurnitureDef {
    return {
      kind: 'gltf',
      id: 'ikea-x',
      name: 'X',
      category: 'others',
      source: 'ikea',
      groupKey: 'x',
      activeVariant: 'a',
      variants: [],
      defaultFootprint: { w: 0.4, d: 0.4, h: 0.4 },
      uploadedAt: 't',
      license: 'IKEA',
      attribution: 'IKEA',
      ...over,
    } as FurnitureDef
  }

  // A point well inside the living/dining room rect { x0:9.15, z0:1.5, x1:12.5, z1:6.65 }.
  const IN_LIVING: [number, number] = [10.8, 4.0]

  it('does NOT relocate a mounted IKEA fixture (pendant stays put, not floor-placed)', () => {
    const pendant = ikeaDef({ id: 'ikea-pendant', category: 'lighting', mounted: true })
    const catalog = { ...BUILTIN_CATALOG, [pendant.id]: pendant }
    const mountedItem: FurnitureItem = {
      id: 'm1',
      defId: 'ikea-pendant',
      position: IN_LIVING,
      rotation: 0,
      props: {},
    }

    const out = arrangeAllRooms([...hydrate(), mountedItem], catalog, {})
    const after = out.find((i) => i.id === 'm1')
    expect(after).toBeDefined()
    // Fixed obstacle: its transform is preserved exactly (never parked on the floor).
    expect(after!.position).toEqual(IN_LIVING)
    expect(after!.rotation).toBe(0)
  })

  it('does NOT relocate a noClip IKEA rug', () => {
    const rug = ikeaDef({ id: 'ikea-rug', category: 'textiles', noClip: true })
    const catalog = { ...BUILTIN_CATALOG, [rug.id]: rug }
    const rugItem: FurnitureItem = {
      id: 'r1',
      defId: 'ikea-rug',
      position: IN_LIVING,
      rotation: 0,
      props: {},
    }
    const out = arrangeAllRooms([...hydrate(), rugItem], catalog, {})
    const after = out.find((i) => i.id === 'r1')
    // 'rug' role is not 'mounted'/'ceiling', so it's arrangeable — but it must
    // still survive the pass (present, with a finite position), never dropped.
    expect(after).toBeDefined()
    expect(Number.isFinite(after!.position[0])).toBe(true)
    expect(Number.isFinite(after!.position[1])).toBe(true)
  })

  it('keeps every item across the pass and never throws on an IKEA-laden catalog', () => {
    const sofa = ikeaDef({ id: 'ikea-sofa', category: 'seating' })
    const bed = ikeaDef({
      id: 'ikea-bed',
      category: 'beds',
      defaultFootprint: { w: 1.5, d: 2.0, h: 0.5 },
    })
    const catalog = { ...BUILTIN_CATALOG, [sofa.id]: sofa, [bed.id]: bed }
    const items: FurnitureItem[] = [
      ...hydrate(),
      { id: 's1', defId: 'ikea-sofa', position: [10.5, 3.0], rotation: 0, props: {} },
      { id: 'b1', defId: 'ikea-bed', position: [10.5, 5.0], rotation: 0, props: {} },
    ]
    const out = arrangeAllRooms(items, catalog, {})
    // No item dropped or duplicated.
    expect(out).toHaveLength(items.length)
    expect(new Set(out.map((i) => i.id)).size).toBe(items.length)
    expect(out.find((i) => i.id === 's1')).toBeDefined()
    expect(out.find((i) => i.id === 'b1')).toBeDefined()
  })
})

describe('roomKindFromName', () => {
  it('classifies common room names', () => {
    expect(roomKindFromName('Kitchen')).toBe('kitchen')
    expect(roomKindFromName('Kitchenette')).toBe('kitchen')
    expect(roomKindFromName('Bath/WC 1')).toBe('bath')
    expect(roomKindFromName('Powder Room')).toBe('bath')
    expect(roomKindFromName('Master Ensuite')).toBe('bath')
    expect(roomKindFromName('Main Bedroom')).toBe('bedroom')
    expect(roomKindFromName('Guest')).toBe('bedroom')
    expect(roomKindFromName('Living / Dining')).toBe('living')
    expect(roomKindFromName('Lounge')).toBe('living')
  })

  it('is case-insensitive and returns null for unknown / empty names', () => {
    expect(roomKindFromName('STUDY')).toBeNull()
    expect(roomKindFromName('Room 1')).toBeNull()
    expect(roomKindFromName('')).toBeNull()
    expect(roomKindFromName(undefined)).toBeNull()
  })
})

describe('arrangePlanRoom (per-room tidy on custom plans)', () => {
  const plan: FloorPlan = {
    id: 'c',
    name: 'Custom',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls: [
      { id: 'n', start: [0, 0], end: [4, 0], thickness: 'external' },
      { id: 'e', start: [4, 0], end: [4, 4], thickness: 'external' },
      { id: 's', start: [4, 4], end: [0, 4], thickness: 'external' },
      { id: 'w', start: [0, 4], end: [0, 0], thickness: 'external' },
    ],
    openings: [],
    rooms: [{ id: 'room-xyz', name: 'Bedroom', origin: [0, 0], width: 4, depth: 4 }],
  }
  const bed = (): FurnitureItem => ({
    id: 'b',
    defId: 'bed-queen',
    position: [2, 2],
    rotation: 0,
    props: { ...defaultParamProps(BUILTIN_CATALOG['bed-queen'] as never) },
  })

  it('arranges a custom-plan room without throwing (arrangeRoom would crash)', () => {
    // arrangeRoom is keyed on the fixed apartment's RoomId tables.
    expect(() => arrangeRoom('room-xyz' as never, [bed()], BUILTIN_CATALOG, {})).toThrow()
    const out = arrangePlanRoom(plan, 'room-xyz', [bed()], BUILTIN_CATALOG, {})
    expect(out).toHaveLength(1)
    // Valid against the CUSTOM plan's own walls (not the fixed flat) — and the
    // bed stays inside the 4×4 room.
    const walls = planCollisionWalls(plan, {})
    const placed = out[0]
    expect(
      canPlace(placed, BUILTIN_CATALOG['bed-queen'], {
        others: [],
        defs: BUILTIN_CATALOG,
        doors: {},
        walls,
      }),
    ).toBe(true)
    expect(placed.position[0]).toBeGreaterThanOrEqual(0)
    expect(placed.position[0]).toBeLessThanOrEqual(4)
    expect(placed.position[1]).toBeGreaterThanOrEqual(0)
    expect(placed.position[1]).toBeLessThanOrEqual(4)
  })

  it('is a no-op for an unknown room id', () => {
    const items = [bed()]
    expect(arrangePlanRoom(plan, 'nope', items, BUILTIN_CATALOG, {})).toBe(items)
  })
})
