import { afterEach, describe, expect, it } from 'vitest'
import { setResolvedFlags } from '../features/featureFlags'
import { resolveFlags } from '../features/flags/resolve'
import type { FloorPlan } from '../floorplan/types'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { dxfCircle, dxfLine, dxfPolyline, dxfText, planToDxf } from './dxf'

/** Count non-overlapping occurrences of `needle` in `hay`. */
function count(hay: string, needle: string): number {
  let n = 0
  let i = 0
  for (;;) {
    const idx = hay.indexOf(needle, i)
    if (idx === -1) break
    n++
    i = idx + needle.length
  }
  return n
}

/** Number of DXF entities of `type` (group code 0 == type). */
function entityCount(dxf: string, type: string): number {
  return count(dxf, `\n0\n${type}\n`)
}

/** Number of DXF entities of `type` on a specific `layer` (group codes 0/8) —
 *  G6 adds a DIMENSIONS/FURNITURE/OPENING_MARKS layer that also emits
 *  LINE/TEXT entities, so tests scoped to WALLS/DOORS/WINDOWS/LABELS must
 *  filter by layer rather than count every entity of a type in the document. */
function layerEntityCount(dxf: string, type: string, layer: string): number {
  return count(dxf, `\n0\n${type}\n8\n${layer}\n`)
}

const smallPlan: FloorPlan = {
  id: 'p1',
  name: 'Test Flat',
  ceilingHeight: 2.6,
  extent: [4, 3],
  walls: [
    { id: 'w-n', start: [0, 0], end: [4, 0], thickness: 'external' },
    { id: 'w-e', start: [4, 0], end: [4, 3], thickness: 'external' },
    { id: 'w-s', start: [4, 3], end: [0, 3], thickness: 'external' },
    { id: 'w-w', start: [0, 3], end: [0, 0], thickness: 'external' },
  ],
  openings: [
    { id: 'd1', kind: 'door', wallId: 'w-w', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    { id: 'win1', kind: 'window', wallId: 'w-n', offset: 1.5, width: 1.2, sill: 0.9, head: 2.1 },
  ],
  rooms: [{ id: 'living', name: 'Living Room', origin: [0, 0], width: 4, depth: 3 }],
}

describe('planToDxf', () => {
  const dxf = planToDxf(smallPlan)

  it('emits a well-formed DXF skeleton', () => {
    expect(dxf).toContain('SECTION')
    expect(dxf).toContain('ENTITIES')
    expect(dxf).toContain('HEADER')
    expect(dxf).toContain('TABLES')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })

  it('declares MILLIMETRES via $INSUNITS = 4, plus metric $MEASUREMENT', () => {
    expect(dxf).toContain('$INSUNITS')
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/)
  })

  it('defines all layers (walls/rooms/openings/labels + G6/G6b enrichment) in the LAYER table', () => {
    for (const layer of [
      'WALLS',
      'ROOMS',
      'DOORS',
      'WINDOWS',
      'LABELS',
      'FURNITURE',
      'FURNITURE_TEXT',
      'DIMENSIONS',
      'OPENING_MARKS',
      'ELECTRICAL',
      'PLUMBING',
    ]) {
      expect(dxf).toContain(layer)
    }
    // Each layer appears as a LAYER table entry (group code 2).
    expect(count(dxf, '\n2\nWALLS\n')).toBeGreaterThanOrEqual(1)
  })

  it('assigns a distinct AutoCAD colour index to each layer via group code 62', () => {
    const expected: Record<string, number> = {
      WALLS: 7,
      ROOMS: 5,
      DOORS: 3,
      WINDOWS: 4,
      LABELS: 2,
      FURNITURE: 4,
      FURNITURE_TEXT: 2,
      DIMENSIONS: 1,
      OPENING_MARKS: 6,
      ELECTRICAL: 3,
      PLUMBING: 5,
    }
    for (const [layer, color] of Object.entries(expected)) {
      expect(dxf).toMatch(new RegExp(`LAYER\\n2\\n${layer}\\n70\\n0\\n62\\n${color}\\n`))
    }
  })

  it('opens an OPENING_MARKS TEXT beside each door/window (D1/W1)', () => {
    expect(dxf).toMatch(/TEXT\n8\nOPENING_MARKS/)
    expect(dxf).toContain('1\nD1')
    expect(dxf).toContain('1\nW1')
  })

  it('renders the auto-dimension strings on the DIMENSIONS layer', () => {
    // At least one main dimension LINE + its two ticks + two extension stubs.
    expect(dxf).toMatch(/LINE\n8\nDIMENSIONS/)
    expect(dxf).toMatch(/TEXT\n8\nDIMENSIONS/)
    // The north wall (4 m) is an overall dimension → its formatted label.
    // The DXF deliberately keeps METRES here (not the printed sheets' integer
    // mm), matching its own $INSUNITS = 6 header and metre coordinates.
    // Integer mm, matching the file's own $INSUNITS = 4 and the printed sheets.
    expect(dxf).toContain('4000')
  })

  it('emits one LINE per non-zero wall (+ opening lines on their own layers)', () => {
    const wallDoorWindowLines =
      layerEntityCount(dxf, 'LINE', 'WALLS') +
      layerEntityCount(dxf, 'LINE', 'DOORS') +
      layerEntityCount(dxf, 'LINE', 'WINDOWS')
    expect(wallDoorWindowLines).toBe(smallPlan.walls.length + smallPlan.openings.length)
  })

  it('emits one closed POLYLINE per room', () => {
    expect(entityCount(dxf, 'POLYLINE')).toBe(smallPlan.rooms.length)
    expect(dxf).toMatch(/POLYLINE\n8\nROOMS\n66\n1\n70\n1/)
  })

  it('emits openings on DOORS and WINDOWS layers', () => {
    expect(dxf).toMatch(/LINE\n8\nDOORS/)
    expect(dxf).toMatch(/LINE\n8\nWINDOWS/)
  })

  it('labels each room by name on the LABELS layer', () => {
    expect(layerEntityCount(dxf, 'TEXT', 'LABELS')).toBe(smallPlan.rooms.length)
    expect(dxf).toContain('Living Room')
    expect(dxf).toMatch(/TEXT\n8\nLABELS/)
  })

  it('flips Z to -Y so the plan is not mirrored', () => {
    // North wall runs along z=0 → Y=0; south wall along z=3 → Y=-3.
    expect(dxf).toContain('20\n-3000.000000')
    expect(dxf).not.toContain('20\n3000.000000')
  })
})

describe('planToDxf edge cases', () => {
  it('handles an empty plan without throwing', () => {
    const empty: FloorPlan = {
      id: 'e',
      name: 'Empty',
      ceilingHeight: 2.6,
      extent: [0, 0],
      walls: [],
      openings: [],
      rooms: [],
    }
    const dxf = planToDxf(empty)
    expect(dxf).toContain('ENTITIES')
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
    expect(entityCount(dxf, 'LINE')).toBe(0)
  })

  it('guards missing arrays (Array.isArray) and zero-length walls', () => {
    // Intentionally malformed plan: missing openings/rooms, a degenerate wall.
    const bad = {
      id: 'b',
      name: 'Bad',
      ceilingHeight: 2.6,
      extent: [2, 2],
      walls: [
        { id: 'good', start: [0, 0], end: [2, 0], thickness: 'external' },
        { id: 'zero', start: [1, 1], end: [1, 1], thickness: 'internal' },
      ],
    } as unknown as FloorPlan
    const dxf = planToDxf(bad)
    // Only the non-degenerate wall yields a WALLS LINE; no openings/rooms/labels
    // (buildDimensions still runs over the one real wall, so the document as a
    // whole gains DIMENSIONS-layer LINE/TEXT — scope the assertions by layer).
    expect(layerEntityCount(dxf, 'LINE', 'WALLS')).toBe(1)
    expect(entityCount(dxf, 'POLYLINE')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'LABELS')).toBe(0)
  })

  it('skips openings whose wall is missing', () => {
    const plan: FloorPlan = {
      ...smallPlan,
      openings: [
        { id: 'orphan', kind: 'door', wallId: 'nope', offset: 0, width: 1, sill: 0, head: 2 },
      ],
    }
    const dxf = planToDxf(plan)
    // 4 wall LINEs, 0 opening LINEs.
    expect(layerEntityCount(dxf, 'LINE', 'WALLS')).toBe(smallPlan.walls.length)
    expect(layerEntityCount(dxf, 'LINE', 'DOORS')).toBe(0)
    expect(layerEntityCount(dxf, 'LINE', 'WINDOWS')).toBe(0)
  })

  it('exports a polygon room outline', () => {
    const plan: FloorPlan = {
      ...smallPlan,
      rooms: [
        {
          id: 'L',
          name: 'L Room',
          origin: [0, 0],
          width: 3,
          depth: 3,
          polygon: [
            [0, 0],
            [3, 0],
            [3, 1],
            [1, 1],
            [1, 3],
            [0, 3],
          ],
        },
      ],
    }
    const dxf = planToDxf(plan)
    expect(entityCount(dxf, 'POLYLINE')).toBe(1)
    // 6 polygon vertices → 6 VERTEX entities.
    expect(entityCount(dxf, 'VERTEX')).toBe(6)
  })
})

describe('planToDxf furniture (G6)', () => {
  // A 2m × 1m footprint, position (1,1), rotated 90°. Hand-computed world
  // corners (see the OBB math this mirrors, itemFootprint + obbCorners):
  //   local corners (∓1, ∓0.5) rotated 90° about (1,1) →
  //   (1.5, 0), (1.5, 2), (0.5, 2), (0.5, 0) in plan (x, z) —
  //   flipped to DXF (x, -z): (1.5, 0), (1.5, -2), (0.5, -2), (0.5, 0).
  const def: BuiltinGltfDef = {
    id: 'test-item',
    name: 'Test Sideboard',
    category: 'storage',
    kind: 'gltf',
    source: 'builtin',
    url: '/none-g6.glb',
    license: 'CC0',
    defaultFootprint: { w: 2, d: 1, h: 1 },
  }
  const item: FurnitureItem = {
    id: 'it1',
    defId: 'test-item',
    position: [1, 1],
    rotation: Math.PI / 2,
    props: {},
  }
  const catalog: Record<string, FurnitureDef> = { 'test-item': def }
  const dxf = planToDxf(smallPlan, [item], catalog)

  it('emits the rotated footprint as a 4-vertex closed POLYLINE on FURNITURE', () => {
    expect(dxf).toMatch(/POLYLINE\n8\nFURNITURE\n66\n1\n70\n1/)
    expect(count(dxf, '\n0\nVERTEX\n8\nFURNITURE\n')).toBe(4)
    // Hand-computed DXF (x, -z) pairs for the 4 rotated corners.
    expect(dxf).toContain('10\n1500.000000\n20\n0.000000\n30\n0.000000')
    expect(dxf).toContain('10\n1500.000000\n20\n-2000.000000\n30\n0.000000')
    expect(dxf).toContain('10\n500.000000\n20\n-2000.000000\n30\n0.000000')
    // The 4th corner's Z lands on a signed-zero float residue (-0.000000).
    expect(dxf).toMatch(/10\n500\.000000\n20\n-?0\.000000\n30\n0\.000000/)
  })

  it('labels the item by def name at the footprint centre on FURNITURE_TEXT', () => {
    expect(dxf).toMatch(/TEXT\n8\nFURNITURE_TEXT/)
    expect(dxf).toContain('Test Sideboard')
    // Centre (1,1) → DXF (1,-1).
    expect(dxf).toMatch(/TEXT\n8\nFURNITURE_TEXT\n10\n1000\.000000\n20\n-1000\.000000/)
  })

  it('prefers the item label override over the def name', () => {
    const labelled: FurnitureItem = { ...item, label: 'My Console' }
    const withLabel = planToDxf(smallPlan, [labelled], catalog)
    expect(withLabel).toContain('My Console')
    expect(withLabel).not.toContain('Test Sideboard')
  })

  it('skips an item whose def is missing from the catalog', () => {
    const orphan: FurnitureItem = { ...item, defId: 'nope' }
    const withOrphan = planToDxf(smallPlan, [orphan], {})
    expect(entityCount(withOrphan, 'POLYLINE')).toBe(entityCount(planToDxf(smallPlan), 'POLYLINE'))
  })

  it('is deterministic — same input yields byte-identical output', () => {
    const a = planToDxf(smallPlan, [item], catalog)
    const b = planToDxf(smallPlan, [item], catalog)
    expect(a).toBe(b)
  })

  it('is a well-formed, balanced DXF document (SECTION/ENDSEC pairs + EOF)', () => {
    // The very first bytes of the document are "0\nSECTION\n" — no leading
    // "\n" to anchor on there, so count the literal without it.
    const sectionCount = count(dxf, '0\nSECTION\n')
    expect(sectionCount).toBe(count(dxf, '\n0\nENDSEC\n'))
    expect(sectionCount).toBeGreaterThanOrEqual(3) // HEADER, TABLES, ENTITIES
    expect(count(dxf, '\n0\nPOLYLINE\n')).toBe(count(dxf, '\n0\nSEQEND\n'))
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
  })
})

describe('planToDxf MEP points (G6b)', () => {
  const planWithMep: FloorPlan = {
    ...smallPlan,
    electricalPoints: [
      { id: 'e1', x: 1, z: 2, kind: 'switch', mountHeightMm: 1200 },
      { id: 'e2', x: 2, z: 2, kind: 'socket' },
    ],
    plumbingPoints: [{ id: 'p1', x: 3, z: 1, kind: 'water-point', mountHeightMm: 600 }],
  }

  it('emits a CIRCLE + symbol TEXT for each persisted electrical point on ELECTRICAL', () => {
    const dxf = planToDxf(planWithMep)
    expect(layerEntityCount(dxf, 'CIRCLE', 'ELECTRICAL')).toBe(2)
    // Point (1,2) → DXF (1,-2), radius 0.06.
    expect(dxf).toMatch(
      /CIRCLE\n8\nELECTRICAL\n10\n1000\.000000\n20\n-2000\.000000\n30\n0\.000000\n40\n60\.000000/,
    )
    // "switch" (symbol "S") + mount-height suffix "@1200" beside the circle.
    expect(dxf).toContain('1\nS @1200')
  })

  it('omits the mount-height suffix when unset', () => {
    const dxf = planToDxf(planWithMep)
    // "socket" has an empty symbol glyph and no mount height ⇒ no side TEXT
    // at all for that point (only its CIRCLE marker).
    expect(dxf).not.toContain('@undefined')
    expect(dxf).not.toMatch(/1\nS\n/) // no bare "S" without the suffix present elsewhere
  })

  // BSJ-3 circuit tags gate on the `switchCircuits` pro flag; the store defaults
  // to Simple, so force the resolved snapshot per mode and restore it after.
  const litItem: FurnitureItem = {
    id: 'lite1',
    defId: 'ceiling-light',
    position: [2.5, 1.5],
    rotation: 0,
    props: {},
  }
  const planCtl: FloorPlan = {
    ...smallPlan,
    electricalPoints: [{ id: 'e1', x: 1, z: 2, kind: 'switch', controls: ['lite1'] }],
  }
  afterEach(() => setResolvedFlags(resolveFlags(false, {}, false, 'simple')))

  it('suffixes a linked switch with its circuit tag in Pro mode (BSJ-3)', () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'pro'))
    // A ceiling light + a switch controlling it. Lights derive from the placed
    // items via `buildLightingPlan`, so an empty catalog still yields the light.
    const dxf = planToDxf(planCtl, [litItem], {})
    expect(dxf).toContain('S [S1]')
  })

  it('omits circuit tags in Simple mode (flag forced off) (BSJ-3)', () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    const dxf = planToDxf(planCtl, [litItem], {})
    expect(dxf).not.toContain('[S1]')
  })

  it('omits circuit tags when the switch controls nothing (BSJ-3)', () => {
    setResolvedFlags(resolveFlags(false, {}, false, 'pro'))
    const dxf = planToDxf(
      { ...smallPlan, electricalPoints: [{ id: 'e1', x: 1, z: 2, kind: 'switch' }] },
      [],
      {},
    )
    expect(dxf).not.toContain('[S1]')
  })

  it('emits a CIRCLE + symbol TEXT for each persisted plumbing point on PLUMBING', () => {
    const dxf = planToDxf(planWithMep)
    expect(layerEntityCount(dxf, 'CIRCLE', 'PLUMBING')).toBe(1)
    // Point (3,1) → DXF (3,-1).
    expect(dxf).toMatch(
      /CIRCLE\n8\nPLUMBING\n10\n3000\.000000\n20\n-1000\.000000\n30\n0\.000000\n40\n60\.000000/,
    )
    expect(dxf).toContain('1\nW @600')
  })

  it('filters out MEP points tagged to an upper storey (levelId set) — ground-only, matching walls/rooms', () => {
    const upperOnly: FloorPlan = {
      ...smallPlan,
      electricalPoints: [{ id: 'e-up', x: 0, z: 0, kind: 'switch', levelId: 'level-1' }],
      plumbingPoints: [{ id: 'p-up', x: 0, z: 0, kind: 'water-point', levelId: 'level-1' }],
    }
    const dxf = planToDxf(upperOnly)
    expect(layerEntityCount(dxf, 'CIRCLE', 'ELECTRICAL')).toBe(0)
    expect(layerEntityCount(dxf, 'CIRCLE', 'PLUMBING')).toBe(0)
  })

  it('emits no ELECTRICAL/PLUMBING entities when the arrays are empty/absent', () => {
    const dxf = planToDxf(smallPlan)
    expect(layerEntityCount(dxf, 'CIRCLE', 'ELECTRICAL')).toBe(0)
    expect(layerEntityCount(dxf, 'CIRCLE', 'PLUMBING')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'ELECTRICAL')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'PLUMBING')).toBe(0)
    // The layer table entries still exist (same style as an empty FURNITURE layer).
    expect(dxf).toMatch(/LAYER\n2\nELECTRICAL\n70\n0\n62\n3\n/)
    expect(dxf).toMatch(/LAYER\n2\nPLUMBING\n70\n0\n62\n5\n/)
  })

  it('is deterministic — same MEP input yields byte-identical output', () => {
    const a = planToDxf(planWithMep)
    const b = planToDxf(planWithMep)
    expect(a).toBe(b)
  })
})

describe('planToDxf demolition (H5)', () => {
  // Baseline has an extra internal wall (w-mid) that `current` removed, and
  // `current` adds a new wall (w-new) the baseline never had. `w-mid` runs
  // z=0..3 at x=2 → midpoint (2, 1.5) → DXF (2, -1.5).
  const baseline: FloorPlan = {
    ...smallPlan,
    walls: [...smallPlan.walls, { id: 'w-mid', start: [2, 0], end: [2, 3], thickness: 'internal' }],
  }
  // `current` (smallPlan) already lacks w-mid (demolished) and adds w-new:
  // x=1..1 (vertical), z=0..1 → midpoint (1, 0.5) → DXF (1, -0.5).
  const current: FloorPlan = {
    ...smallPlan,
    walls: [...smallPlan.walls, { id: 'w-new', start: [1, 0], end: [1, 1], thickness: 'internal' }],
  }

  it('defines DEMOLITION/NEW_WORKS in the LAYER table with a distinct colour', () => {
    const dxf = planToDxf(current, [], {}, 'metric', baseline)
    expect(dxf).toMatch(/LAYER\n2\nDEMOLITION\n70\n0\n62\n1\n/)
    expect(dxf).toMatch(/LAYER\n2\nNEW_WORKS\n70\n0\n62\n3\n/)
  })

  it('emits a demolished wall as a LINE + "(DEMOLISH)" TEXT at its midpoint on DEMOLITION', () => {
    const dxf = planToDxf(current, [], {}, 'metric', baseline)
    // Hand-computed: w-mid (2,0)→(2,3) in plan, DXF Z flips: (2,0)→(2,-3).
    expect(dxf).toMatch(
      /LINE\n8\nDEMOLITION\n10\n2000\.000000\n20\n0\.000000\n30\n0\.000000\n11\n2000\.000000\n21\n-3000\.000000\n31\n0\.000000/,
    )
    expect(dxf).toMatch(/TEXT\n8\nDEMOLITION\n10\n2000\.000000\n20\n-1500\.000000/)
    expect(dxf).toContain('(DEMOLISH)')
    expect(dxf).not.toContain('NOT PERMITTED')
  })

  it('escalates a load-bearing demolished wall to the NOT PERMITTED label', () => {
    const lbBaseline: FloorPlan = {
      ...smallPlan,
      walls: [
        ...smallPlan.walls,
        {
          id: 'w-mid',
          start: [2, 0],
          end: [2, 3],
          thickness: 'internal',
          structure: 'load-bearing',
        },
      ],
    }
    const dxf = planToDxf(current, [], {}, 'metric', lbBaseline)
    expect(dxf).toContain('(DEMOLISH) NOT PERMITTED - LOAD-BEARING')
  })

  it('labels an added wall "(NEW)" on NEW_WORKS but keeps it drawn on WALLS (no DEMOLITION line for it)', () => {
    const dxf = planToDxf(current, [], {}, 'metric', baseline)
    expect(dxf).toMatch(/TEXT\n8\nNEW_WORKS\n10\n1000\.000000\n20\n-500\.000000/)
    expect(dxf).toContain('(NEW)')
    // w-new is drawn once on WALLS (the new-works reality), never re-drawn on DEMOLITION.
    expect(dxf).toMatch(
      /LINE\n8\nWALLS\n10\n1000\.000000\n20\n0\.000000\n30\n0\.000000\n11\n1000\.000000\n21\n-1000\.000000\n31\n0\.000000/,
    )
    expect(layerEntityCount(dxf, 'LINE', 'DEMOLITION')).toBe(1) // only w-mid, not w-new
  })

  it('keeps a kept wall on WALLS only — no DEMOLITION/NEW_WORKS entity for it', () => {
    const dxf = planToDxf(current, [], {}, 'metric', baseline)
    // w-n (0,0)-(4,0) is kept — present in both plans.
    expect(layerEntityCount(dxf, 'TEXT', 'DEMOLITION')).toBe(1) // only w-mid's label
    expect(layerEntityCount(dxf, 'TEXT', 'NEW_WORKS')).toBe(1) // only w-new's label
  })

  it('omits DEMOLITION/NEW_WORKS entities entirely with no baseline', () => {
    const dxf = planToDxf(current)
    expect(layerEntityCount(dxf, 'LINE', 'DEMOLITION')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'DEMOLITION')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'NEW_WORKS')).toBe(0)
    // Layer table entries still exist (same empty-layer convention as ELECTRICAL/PLUMBING).
    expect(dxf).toMatch(/LAYER\n2\nDEMOLITION\n70\n0\n62\n1\n/)
    expect(dxf).toMatch(/LAYER\n2\nNEW_WORKS\n70\n0\n62\n3\n/)
  })

  it('omits DEMOLITION/NEW_WORKS entities when the baseline equals the current plan (no wall changes)', () => {
    const dxf = planToDxf(smallPlan, [], {}, 'metric', smallPlan)
    expect(layerEntityCount(dxf, 'LINE', 'DEMOLITION')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'DEMOLITION')).toBe(0)
    expect(layerEntityCount(dxf, 'TEXT', 'NEW_WORKS')).toBe(0)
  })

  it('is deterministic — same input yields byte-identical output', () => {
    const a = planToDxf(current, [], {}, 'metric', baseline)
    const b = planToDxf(current, [], {}, 'metric', baseline)
    expect(a).toBe(b)
  })
})

describe('dxf helpers', () => {
  it('dxfLine writes both endpoints with Z flipped', () => {
    const s = dxfLine('WALLS', 1, 2, 3, 4)
    expect(s).toContain('LINE')
    expect(s).toMatch(/10\n1000\.000000/)
    expect(s).toMatch(/20\n-2000\.000000/)
    expect(s).toMatch(/11\n3000\.000000/)
    expect(s).toMatch(/21\n-4000\.000000/)
  })

  it('dxfPolyline is closed and lists every vertex', () => {
    const s = dxfPolyline('ROOMS', [
      [0, 0],
      [1, 0],
      [1, 1],
    ])
    expect(s).toMatch(/POLYLINE\n8\nROOMS\n66\n1\n70\n1/)
    expect(count(s, '\n0\nVERTEX\n')).toBe(3)
    expect(s).toContain('SEQEND')
  })

  it('dxfCircle writes a centred CIRCLE with Z flipped and the given radius', () => {
    const s = dxfCircle('ELECTRICAL', 1, 2, 0.06)
    expect(s).toContain('CIRCLE')
    expect(s).toMatch(/10\n1000\.000000/)
    expect(s).toMatch(/20\n-2000\.000000/)
    expect(s).toMatch(/40\n60\.000000/)
  })

  it('dxfText sanitises newlines in the label', () => {
    const s = dxfText('LABELS', 0, 0, 'Master\nBedroom')
    expect(s).toContain('Master Bedroom')
    expect(s).not.toContain('Master\nBedroom')
  })
})

describe('planToDxf multi-storey opening marks (schedule agreement)', () => {
  // Ground: a door + a window. Upper: a distinct-size door + window. The
  // door/window schedule numbers these continuously (ground D1/W1, upper
  // D2/W2). The DXF exports the GROUND storey only, but assigns marks
  // plan-wide via the shared `assignOpeningMarks`, so its ground marks must
  // match the schedule's ground marks — never restart or collide with the
  // upper-storey numbering.
  const multi: FloorPlan = {
    ...smallPlan,
    openings: [
      { id: 'gd', kind: 'door', wallId: 'w-w', offset: 1, width: 0.9, sill: 0, head: 2.1 },
      { id: 'gw', kind: 'window', wallId: 'w-n', offset: 1.5, width: 1.2, sill: 0.9, head: 2.1 },
    ],
    upperLevels: [
      {
        id: 'up',
        name: 'Upper',
        elevation: 2.9,
        walls: [{ id: 'uw-n', start: [0, 0], end: [4, 0], thickness: 'external' }],
        openings: [
          { id: 'ud', kind: 'door', wallId: 'uw-n', offset: 0, width: 0.7, sill: 0, head: 2.1 },
          { id: 'uw', kind: 'window', wallId: 'uw-n', offset: 2, width: 2.4, sill: 0.4, head: 2.4 },
        ],
        rooms: [{ id: 'bed', name: 'Bedroom', origin: [0, 0], width: 4, depth: 3 }],
      },
    ],
  }
  const dxf = planToDxf(multi)

  it('marks ground openings D1/W1 (the schedule numbering for those openings)', () => {
    expect(dxf).toContain('1\nD1')
    expect(dxf).toContain('1\nW1')
  })

  it('does NOT emit the upper-storey marks (D2/W2) — it exports the ground storey only', () => {
    // (Confirms the DXF is ground-only; the schedule still lists D2/W2.)
    expect(dxf).not.toContain('1\nD2')
    expect(dxf).not.toContain('1\nW2')
  })
})

describe('planToDxf units (mm convention)', () => {
  /** A bare 4 m x 3 m room so every coordinate is hand-checkable. */
  const unitPlan = {
    id: 'u',
    name: 'Units',
    ceilingHeight: 2.8,
    extent: [4, 3],
    walls: [
      { id: 'n', start: [0, 0], end: [4, 0], thickness: 'external' },
      { id: 'w', start: [0, 0], end: [0, 3], thickness: 'external' },
    ],
    openings: [],
    rooms: [{ id: 'r', name: 'Room', origin: [0, 0], width: 4, depth: 3 }],
  } as unknown as FloorPlan

  const out = planToDxf(unitPlan, [], {}, 'metric')

  it('declares metric via $MEASUREMENT = 1', () => {
    // Separate header variable from $INSUNITS: it selects the hatch-pattern and
    // linetype definition files, so without it a host may load imperial ones
    // for a millimetre drawing. It was not emitted at all before.
    expect(out).toMatch(/\$MEASUREMENT\n70\n1/)
  })

  it('writes a 4 m wall as 4000 units, not 4', () => {
    // The whole point: a metre-unit file imported against an mm template (or by
    // an importer that ignores $INSUNITS) lands 1000x too small.
    expect(out).toContain('10\n4000.000000')
    expect(out).not.toMatch(/10\n4\.000000\n/)
  })

  it('keeps the Z flip after scaling', () => {
    // Plan (0,3) → DXF (0, -3000). Scaling must not lose the sign convention.
    expect(out).toContain('20\n-3000.000000')
  })

  it('scales TEXT height into the same unit as the geometry', () => {
    // A text height left in metres would render 1000x too small to see. The
    // authored 0.25 m room label becomes 250 units.
    expect(out).toMatch(/40\n250\.000000/)
  })

  it('has no bare sub-millimetre coordinate left behind', () => {
    // A missed call site would show up as a coordinate under 1 unit — nothing
    // in a real plan is legitimately 0.x mm. Signed zero is fine.
    const stray = [...out.matchAll(/\n(?:10|11|20|21|40)\n(-?0\.\d*[1-9]\d*)\n/g)]
    expect(stray.map((m) => m[1])).toEqual([])
  })
})
