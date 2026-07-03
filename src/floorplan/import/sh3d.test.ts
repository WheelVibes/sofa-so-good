// @vitest-environment happy-dom
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  categoryForPieceName,
  importResultToFloorPlan,
  openingKindForName,
  parseHomeXml,
  parseSh3d,
  Sh3dParseError,
} from './sh3d'

/** Zip a Home.xml string into a synthetic `.sh3d` byte array. */
function makeSh3d(homeXml: string, entry = 'Home.xml'): Uint8Array {
  return zipSync({ [entry]: strToU8(homeXml) })
}

/** A small but representative Home.xml: two walls, a room, and a piece. SH3D
 *  coordinates are centimetres with a screen Y-down axis; here the plan is
 *  offset from the origin (start at 100,200 cm) to exercise the translation. */
const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<home wallHeight="280">
  <wall id="w1" xStart="100" yStart="200" xEnd="500" yStart2="" yEnd="200" thickness="20"/>
  <wall id="w2" xStart="500" yStart="200" xEnd="500" yEnd="600" thickness="8"/>
  <room id="r1" name="Living">
    <point x="100" y="200"/>
    <point x="500" y="200"/>
    <point x="500" y="600"/>
    <point x="100" y="600"/>
  </room>
  <pieceOfFurniture id="p1" name="Comfy Sofa" x="300" y="400" angle="0" width="200" depth="90" height="80"/>
  <pieceOfFurniture id="p2" name="Mysterious Object" x="150" y="250" angle="1.5708" width="40" depth="40" height="40"/>
</home>`

describe('parseHomeXml — geometry conversion', () => {
  const result = parseHomeXml(SAMPLE_XML, 'Test plan')

  it('keeps the plan name', () => {
    expect(result.plan.name).toBe('Test plan')
  })

  it('reads ceiling height as metres (cm ÷ 100)', () => {
    expect(result.plan.ceilingHeight).toBeCloseTo(2.8, 6)
  })

  it('converts walls cm→m and anchors the bbox to the origin', () => {
    expect(result.plan.walls).toHaveLength(2)
    const w1 = result.plan.walls.find((w) => w.id === 'w1')!
    // Source w1 runs (100,200)→(500,200) cm; bbox min is (100,200) cm so it
    // shifts to (0,0)→(4,0) m.
    expect(w1.start[0]).toBeCloseTo(0, 6)
    expect(w1.start[1]).toBeCloseTo(0, 6)
    expect(w1.end[0]).toBeCloseTo(4, 6)
    expect(w1.end[1]).toBeCloseTo(0, 6)
  })

  it('classifies wall thickness (external vs internal) + records metres', () => {
    const w1 = result.plan.walls.find((w) => w.id === 'w1')! // 20cm = 0.2m
    const w2 = result.plan.walls.find((w) => w.id === 'w2')! // 8cm = 0.08m
    expect(w1.thickness).toBe('external')
    expect(w1.thicknessM).toBeCloseTo(0.2, 6)
    expect(w2.thickness).toBe('internal')
    expect(w2.thicknessM).toBeCloseTo(0.08, 6)
  })

  it('converts the room polygon cm→m, anchored to the origin', () => {
    expect(result.plan.rooms).toHaveLength(1)
    const room = result.plan.rooms[0]!
    expect(room.name).toBe('Living')
    expect(room.polygon).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ])
    // Derived bbox fields
    expect(room.origin).toEqual([0, 0])
    expect(room.width).toBeCloseTo(4, 6)
    expect(room.depth).toBeCloseTo(4, 6)
  })

  it('emits a plan extent covering the full bounding box (m)', () => {
    // X spans 100→500 cm = 4 m; Y spans 200→600 cm = 4 m.
    expect(result.plan.extent[0]).toBeCloseTo(4, 6)
    expect(result.plan.extent[1]).toBeCloseTo(4, 6)
  })

  it('maps furniture cm→m with category + rotation, anchored to origin', () => {
    expect(result.items).toHaveLength(2)
    const sofa = result.items.find((i) => i.id === 'p1')!
    // (300,400) cm − (100,200) bbox min = (200,200) cm = (2,2) m
    expect(sofa.position[0]).toBeCloseTo(2, 6)
    expect(sofa.position[1]).toBeCloseTo(2, 6)
    expect(sofa.width).toBeCloseTo(2, 6)
    expect(sofa.depth).toBeCloseTo(0.9, 6)
    expect(sofa.height).toBeCloseTo(0.8, 6)
    expect(sofa.category).toBe('seating')
    expect(sofa.rotation).toBeCloseTo(0, 6)

    const obj = result.items.find((i) => i.id === 'p2')!
    expect(obj.rotation).toBeCloseTo(1.5708, 4)
  })

  it('warns about furniture it cannot categorise (never drops it)', () => {
    const obj = result.items.find((i) => i.id === 'p2')!
    expect(obj.category).toBeNull()
    expect(result.warnings.some((w) => w.includes('Mysterious Object'))).toBe(true)
  })
})

describe('parseSh3d — zipped archive', () => {
  it('unzips, finds Home.xml, and parses the geometry', () => {
    const bytes = makeSh3d(SAMPLE_XML)
    const result = parseSh3d(bytes, 'Zipped plan')
    expect(result.plan.name).toBe('Zipped plan')
    expect(result.plan.walls).toHaveLength(2)
    expect(result.plan.rooms).toHaveLength(1)
    expect(result.items).toHaveLength(2)
  })

  it('finds Home.xml case-insensitively / in a sub-path', () => {
    const bytes = makeSh3d(SAMPLE_XML, 'somefolder/home.xml')
    const result = parseSh3d(bytes)
    expect(result.plan.walls).toHaveLength(2)
  })
})

describe('parseSh3d — graceful degradation (no throw on soft problems)', () => {
  it('reports an empty plan via warnings, not an exception', () => {
    const bytes = makeSh3d('<?xml version="1.0"?><home wallHeight="250"></home>')
    const result = parseSh3d(bytes)
    expect(result.plan.walls).toHaveLength(0)
    expect(result.plan.rooms).toHaveLength(0)
    expect(result.items).toHaveLength(0)
    expect(result.warnings.some((w) => /no walls or rooms/i.test(w))).toBe(true)
    // Falls back to a default ceiling-derived extent in importResultToFloorPlan.
    const plan = importResultToFloorPlan(result)
    expect(plan.extent[0]).toBeGreaterThanOrEqual(1)
    expect(plan.extent[1]).toBeGreaterThanOrEqual(1)
  })

  it('skips malformed walls / rooms / furniture with a warning, keeping good ones', () => {
    const xml = `<?xml version="1.0"?>
<home wallHeight="250">
  <wall id="ok" xStart="0" yStart="0" xEnd="300" yEnd="0" thickness="10"/>
  <wall id="bad" xStart="0" yStart="0" xEnd="" yEnd="0" thickness="10"/>
  <room id="thin" name="Sliver"><point x="0" y="0"/><point x="1" y="1"/></room>
  <pieceOfFurniture id="okp" name="Bed" x="10" y="10" width="200" depth="150" height="40"/>
  <pieceOfFurniture id="badp" name="Broken" x="10" y="" width="200" depth="150"/>
</home>`
    const result = parseSh3d(makeSh3d(xml))
    expect(result.plan.walls.map((w) => w.id)).toEqual(['ok'])
    expect(result.plan.rooms).toHaveLength(0)
    expect(result.items.map((i) => i.id)).toEqual(['okp'])
    expect(result.warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects absurd (corrupt) coordinates as out-of-range', () => {
    const xml = `<?xml version="1.0"?>
<home wallHeight="250">
  <wall id="huge" xStart="0" yStart="0" xEnd="99999999" yEnd="0" thickness="10"/>
</home>`
    const result = parseSh3d(makeSh3d(xml))
    expect(result.plan.walls).toHaveLength(0)
    expect(result.warnings.some((w) => /out-of-range/i.test(w))).toBe(true)
  })
})

describe('parseSh3d — hard failures throw Sh3dParseError', () => {
  it('throws on a non-zip byte array', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(() => parseSh3d(garbage)).toThrow(Sh3dParseError)
  })

  it('throws when the archive has no Home.xml', () => {
    const bytes = zipSync({ 'readme.txt': strToU8('hello') })
    expect(() => parseSh3d(bytes)).toThrow(/No Home\.xml/)
  })

  it('throws on invalid XML inside the archive', () => {
    const bytes = makeSh3d('<home><wall unterminated')
    expect(() => parseSh3d(bytes)).toThrow(Sh3dParseError)
  })
})

describe('importResultToFloorPlan', () => {
  it('produces a complete, well-formed FloorPlan', () => {
    const result = parseHomeXml(SAMPLE_XML, 'My import')
    const plan = importResultToFloorPlan(result, 'fixed-id')
    expect(plan.id).toBe('fixed-id')
    expect(plan.name).toBe('My import')
    expect(plan.ceilingHeight).toBeCloseTo(2.8, 6)
    expect(plan.walls).toHaveLength(2)
    expect(plan.rooms).toHaveLength(1)
    expect(plan.openings).toEqual([])
  })

  it('mints a unique id when none is supplied', () => {
    const result = parseHomeXml(SAMPLE_XML)
    expect(importResultToFloorPlan(result).id).toMatch(/^sh3d-/)
  })
})

describe('categoryForPieceName heuristics', () => {
  it('maps common furniture names to categories', () => {
    expect(categoryForPieceName('Double Bed')).toBe('beds')
    expect(categoryForPieceName('3-seat sofa')).toBe('seating')
    expect(categoryForPieceName('Dining table')).toBe('tables')
    expect(categoryForPieceName('Tall wardrobe')).toBe('storage')
    expect(categoryForPieceName('Kitchen sink')).toBe('kitchen')
    expect(categoryForPieceName('Toilet')).toBe('bathroom')
    expect(categoryForPieceName('Refrigerator')).toBe('appliances')
    expect(categoryForPieceName('Floor lamp')).toBe('lighting')
    expect(categoryForPieceName('Potted plant')).toBe('decor')
  })

  it('returns null for an unrecognised name', () => {
    expect(categoryForPieceName('Zorblax 9000')).toBeNull()
  })
})

describe('openingKindForName heuristics', () => {
  it('classifies windows by keyword', () => {
    expect(openingKindForName('Bedroom window')).toBe('window')
    expect(openingKindForName('Casement')).toBe('window')
    expect(openingKindForName('Skylight')).toBe('window')
  })

  it('defaults to door otherwise', () => {
    expect(openingKindForName('Front door')).toBe('door')
    expect(openingKindForName('Sliding entry')).toBe('door')
  })
})

describe('parseHomeXml — door/window opening flag', () => {
  const xml = `<?xml version="1.0"?>
<home wallHeight="250">
  <wall id="w1" xStart="0" yStart="0" xEnd="400" yEnd="0" thickness="20"/>
  <doorOrWindow id="d1" name="Front door" x="200" y="0" width="90" depth="20" height="205"/>
  <pieceOfFurniture id="d2" name="Bedroom window" doorOrWindow="true" x="100" y="0" width="120" depth="20" height="120"/>
  <pieceOfFurniture id="s1" name="Sofa" x="200" y="100" width="200" depth="90" height="80"/>
</home>`
  const result = parseHomeXml(xml)

  it('flags door/window pieces with their kind (and not as plain furniture)', () => {
    const door = result.items.find((i) => i.id === 'd1')!
    const win = result.items.find((i) => i.id === 'd2')!
    const sofa = result.items.find((i) => i.id === 's1')!
    expect(door.opening).toBe('door')
    expect(win.opening).toBe('window')
    expect(sofa.opening).toBeUndefined()
  })

  it('does not category-map or warn about opening pieces', () => {
    const door = result.items.find((i) => i.id === 'd1')!
    expect(door.category).toBeNull()
    // The door should NOT generate an "uncategorisable furniture" warning.
    expect(result.warnings.some((w) => /Front door/.test(w))).toBe(false)
  })

  it('still maps ordinary furniture alongside openings', () => {
    const sofa = result.items.find((i) => i.id === 's1')!
    expect(sofa.category).toBe('seating')
  })
})
