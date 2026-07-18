import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { dxfLine, dxfPolyline, dxfText, planToDxf } from './dxf'

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

  it('declares metres via $INSUNITS = 6', () => {
    expect(dxf).toContain('$INSUNITS')
    expect(dxf).toMatch(/\$INSUNITS\n70\n6/)
  })

  it('defines all layers (walls/rooms/openings/labels + G6 enrichment) in the LAYER table', () => {
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
    expect(dxf).toContain('4.00 m')
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
    expect(dxf).toContain('20\n-3.000000')
    expect(dxf).not.toContain('20\n3.000000')
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
    expect(dxf).toContain('10\n1.500000\n20\n0.000000\n30\n0.000000')
    expect(dxf).toContain('10\n1.500000\n20\n-2.000000\n30\n0.000000')
    expect(dxf).toContain('10\n0.500000\n20\n-2.000000\n30\n0.000000')
    // The 4th corner's Z lands on a signed-zero float residue (-0.000000).
    expect(dxf).toMatch(/10\n0\.500000\n20\n-?0\.000000\n30\n0\.000000/)
  })

  it('labels the item by def name at the footprint centre on FURNITURE_TEXT', () => {
    expect(dxf).toMatch(/TEXT\n8\nFURNITURE_TEXT/)
    expect(dxf).toContain('Test Sideboard')
    // Centre (1,1) → DXF (1,-1).
    expect(dxf).toMatch(/TEXT\n8\nFURNITURE_TEXT\n10\n1\.000000\n20\n-1\.000000/)
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

describe('dxf helpers', () => {
  it('dxfLine writes both endpoints with Z flipped', () => {
    const s = dxfLine('WALLS', 1, 2, 3, 4)
    expect(s).toContain('LINE')
    expect(s).toMatch(/10\n1\.000000/)
    expect(s).toMatch(/20\n-2\.000000/)
    expect(s).toMatch(/11\n3\.000000/)
    expect(s).toMatch(/21\n-4\.000000/)
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

  it('dxfText sanitises newlines in the label', () => {
    const s = dxfText('LABELS', 0, 0, 'Master\nBedroom')
    expect(s).toContain('Master Bedroom')
    expect(s).not.toContain('Master\nBedroom')
  })
})
