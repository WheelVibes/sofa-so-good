// @vitest-environment happy-dom
/**
 * Integration test for the SH3D import wiring (`applySh3dResult`, PARITY-SH3D-FURN).
 *
 * The pure parse (`floorplan/import/sh3d.ts`) and the pure placement pass
 * (`floorplan/import/sh3dPlacement.ts`) are unit-tested in their own suites; this
 * file covers the glue that the original bug report flagged — that the parsed
 * furniture is actually committed to the store (`setItems(...)`, not
 * `setItems([])`) and that door/window pieces land on the plan as openings, all
 * in ONE undoable step.
 *
 * We drive the real store + the real built-in catalog through a synthetic
 * `Home.xml` so the test exercises the full path the file picker uses.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { parseHomeXml } from '../floorplan/import/sh3d'
import { useStore } from '../state/store'
import { applySh3dResult } from './openSh3dImport'

/** A small furnished plan: a 4×4 m room with a recognisable sofa + bed, a door on
 *  a wall, and one unmappable piece. Coordinates are SH3D centimetres. */
const FURNISHED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<home wallHeight="260">
  <wall id="w-top" xStart="0" yStart="0" xEnd="400" yEnd="0" thickness="20"/>
  <wall id="w-right" xStart="400" yStart="0" xEnd="400" yEnd="400" thickness="20"/>
  <wall id="w-bottom" xStart="400" yStart="400" xEnd="0" yEnd="400" thickness="20"/>
  <wall id="w-left" xStart="0" yStart="400" xEnd="0" yEnd="0" thickness="20"/>
  <room id="r1" name="Living">
    <point x="0" y="0"/>
    <point x="400" y="0"/>
    <point x="400" y="400"/>
    <point x="0" y="400"/>
  </room>
  <pieceOfFurniture id="p-sofa" name="Comfy Sofa" x="120" y="350" angle="0" width="200" depth="90" height="80"/>
  <pieceOfFurniture id="p-bed" name="Double Bed" x="300" y="120" angle="1.5708" width="160" depth="200" height="50"/>
  <pieceOfFurniture id="p-mystery" name="Mysterious Object" x="50" y="50" angle="0" width="40" depth="40" height="40"/>
  <doorOrWindow id="d-front" name="Front Door" x="200" y="0" angle="0" width="90" depth="20" height="205"/>
  <doorOrWindow id="w-side" name="Side window" x="400" y="200" angle="0" width="120" depth="20" height="80" elevation="120"/>
</home>`

describe('applySh3dResult — places parsed furniture into the store (PARITY-SH3D-FURN)', () => {
  beforeEach(() => useStore.getState().__resetForTest())

  it('commits the parsed furniture as scene items (not an empty list)', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    // The original bug was `setItems([])` — assert we actually placed pieces.
    expect(s.items.length).toBeGreaterThan(0)
    // The sofa + bed are recognisable categories; the "Mysterious Object" is not.
    expect(s.items.length).toBe(2)
  })

  it('places each item at its imported position (inside the room)', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    for (const it of s.items) {
      const [x, z] = it.position
      // The 4×4 m room spans (0,0)→(4,4) m after origin-anchoring.
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(4)
      expect(z).toBeGreaterThanOrEqual(0)
      expect(z).toBeLessThanOrEqual(4)
    }
  })

  it('carries the imported rotation onto the placed item', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    // The bed was imported at angle 1.5708 rad (~90°); some placed item keeps it.
    expect(s.items.some((it) => Math.abs(it.rotation - 1.5708) < 1e-3)).toBe(true)
  })

  it('associates the door piece to a wall as a plan opening', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    expect(s.floorPlan.openings.length).toBeGreaterThan(0)
    const door = s.floorPlan.openings.find((o) => o.kind === 'door')
    expect(door).toBeDefined()
    expect(door?.wallId).toBe('w-top')
  })

  it('honours a window elevation from the source file as its sill', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    const win = s.floorPlan.openings.find((o) => o.kind === 'window')
    expect(win).toBeDefined()
    expect(win?.sill).toBeCloseTo(1.2, 3)
    expect(win?.head).toBeCloseTo(2.0, 3)
  })

  it('applies the geometry (walls + rooms) alongside the furniture', () => {
    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const s = useStore.getState()
    expect(s.floorPlan.walls.length).toBe(4)
    expect(s.floorPlan.rooms.length).toBe(1)
    expect(s.floorPlan.name).toBe('Furnished plan')
  })

  it('imports as a SINGLE undoable step (items + plan revert together)', () => {
    const before = useStore.getState()
    const beforeItemCount = before.items.length
    const beforePlanId = before.floorPlan.id

    const result = parseHomeXml(FURNISHED_XML, 'Furnished plan')
    applySh3dResult(result, 'Furnished plan')

    const afterImport = useStore.getState()
    expect(afterImport.items.length).not.toBe(beforeItemCount)
    expect(afterImport.floorPlan.id).not.toBe(beforePlanId)

    afterImport.undo()

    const afterUndo = useStore.getState()
    expect(afterUndo.items.length).toBe(beforeItemCount)
    expect(afterUndo.floorPlan.id).toBe(beforePlanId)
  })

  it('handles an empty plan without placing anything', () => {
    const empty = parseHomeXml('<?xml version="1.0"?><home wallHeight="260"></home>', 'Empty')
    applySh3dResult(empty, 'Empty')

    const s = useStore.getState()
    expect(s.items).toHaveLength(0)
    expect(s.floorPlan.openings).toHaveLength(0)
  })
})
