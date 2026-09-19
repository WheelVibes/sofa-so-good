import { describe, expect, it } from 'vitest'
import { resolveFlags, setResolvedFlags } from '../features/featureFlags'
import type { FloorPlan } from '../floorplan/types'
import { deriveElectricalPoints, derivePlumbingPoints } from './mepSuggest'
import type { FurnitureDef, FurnitureItem } from './types'

/** Minimal fixture-def helper (mirrors `appearanceProps.test.ts`'s `paramDef`) —
 *  `deriveElectricalPoints`/`derivePlumbingPoints` only read `id`/`category`. */
function def(id: string, category: FurnitureDef['category'] = 'others'): FurnitureDef {
  return {
    kind: 'parametric',
    id: id as FurnitureDef['id'],
    name: id,
    category,
    defaultFootprint: { w: 1, d: 1, h: 1 },
    primitive: 'Sofa' as never,
    paramSchema: [],
  } as unknown as FurnitureDef
}

function item(defId: string, x: number, z: number, levelId?: string): FurnitureItem {
  return {
    id: `item-${defId}-${x}-${z}`,
    defId: defId as FurnitureItem['defId'],
    position: [x, z],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  }
}

function plan(walls: FloorPlan['walls'] = [], openings: FloorPlan['openings'] = []): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls,
    openings,
    rooms: [],
  }
}

describe('mepSuggest — deriveElectricalPoints', () => {
  it('a desk suggests a double socket + a data point 0.25m over', () => {
    const catalog = { desk: def('desk', 'tables') }
    const pts = deriveElectricalPoints(plan(), [item('desk', 1, 1)], catalog)
    expect(pts).toContainEqual({ x: 1, z: 1, kind: 'socket-double' })
    expect(pts).toContainEqual({ x: 1.25, z: 1, kind: 'data' })
  })

  it('a door suggests a light switch just past the leaf, on the wall', () => {
    const wall = {
      id: 'w1',
      start: [0, 0] as [number, number],
      end: [4, 0] as [number, number],
      thickness: 'internal' as const,
    }
    const door = {
      id: 'd1',
      wallId: 'w1',
      kind: 'door' as const,
      offset: 1,
      width: 0.8,
      sill: 0,
      head: 2.1,
    }
    const pts = deriveElectricalPoints(plan([wall], [door]), [], {})
    // at = offset + width + 0.15 = 1.95 along the wall's +X unit vector.
    expect(pts).toContainEqual({ x: 1.95, z: 0, kind: 'switch' })
  })

  it('tags a point with its item/door level (upper storeys)', () => {
    const catalog = { desk: def('desk', 'tables') }
    const pts = deriveElectricalPoints(plan(), [item('desk', 1, 1, 'up')], catalog)
    expect(pts.every((p) => p.levelId === 'up')).toBe(true)
  })
})

describe('mepSuggest — derivePlumbingPoints', () => {
  it('a WC/toilet suggests a soil pipe at its own back (tank) face, not its centre (W9)', () => {
    // SOIL-PIPE-BACK-WALL: `def('toilet', ...)` here carries the test helper's generic 1x1x1
    // footprint, so half depth is 0.5. At rotation 0 the back (tank) face is local -Z, i.e.
    // world -Z (`z` decreases) — see `mepSuggest.ts`'s doc comment for the sign convention.
    const catalog = { toilet: def('toilet', 'bathroom') }
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    const pts = derivePlumbingPoints([item('toilet', 2, 2)], catalog)
    expect(pts).toContainEqual({ x: 2, z: 1.5, kind: 'soil-pipe' })
    expect(pts).toContainEqual({ x: 2.2, z: 2, kind: 'water-point' })
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
  })

  it('flag off reproduces the exact prior point (the fixture centre)', () => {
    const catalog = { toilet: def('toilet', 'bathroom') }
    setResolvedFlags(resolveFlags(true, { soilPipeBackWall: false }, false, 'simple'))
    const pts = derivePlumbingPoints([item('toilet', 2, 2)], catalog)
    expect(pts).toContainEqual({ x: 2, z: 2, kind: 'soil-pipe' })
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
  })

  it('matches the hand-placed bath1/bath2 toilets exactly: 0.05 m off the wall they are flush to', () => {
    // Reproduces `defaults/bathrooms.ts`'s own derivation for both shipped toilets, at the
    // catalog's real 0.66 m depth (half 0.33), confirming the sign convention generalises.
    const catalog = { toilet: def('toilet', 'bathroom') }
    catalog.toilet.defaultFootprint = { w: 0.4, d: 0.66, h: 0.78 }
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    // bath1: rotation pi, centre (3.515, 6.395) -> tank at south wall face z = 6.775.
    const bath1 = derivePlumbingPoints(
      [{ ...item('toilet', 3.515, 6.395), rotation: Math.PI }],
      catalog,
    )
    const bath1Pipe = bath1.find((p) => p.kind === 'soil-pipe')!
    expect(bath1Pipe.x).toBeCloseTo(3.515, 6)
    expect(bath1Pipe.z).toBeCloseTo(6.725, 6)
    // bath2: rotation pi/2, centre (4.245, 6.525) -> tank at west wall face x = 3.865.
    const bath2 = derivePlumbingPoints(
      [{ ...item('toilet', 4.245, 6.525), rotation: Math.PI / 2 }],
      catalog,
    )
    const bath2Pipe = bath2.find((p) => p.kind === 'soil-pipe')!
    expect(bath2Pipe.x).toBeCloseTo(3.915, 6)
    expect(bath2Pipe.z).toBeCloseTo(6.525, 6)
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
  })

  it('gives a washing machine a 1150 mm bib tap — not the generic 600 mm', () => {
    // YARD-FITTINGS: at the default height the tap resolves onto the wall BEHIND an 850 mm
    // machine and renders inside it. Every OTHER fixture keeps the per-kind default.
    const catalog = { 'washing-machine': def('washing-machine', 'others') }
    const pts = derivePlumbingPoints([item('washing-machine', 3, 4)], catalog)
    expect(pts).toContainEqual({ x: 3, z: 4, kind: 'water-point', mountHeightMm: 1150 })
    expect(pts).toContainEqual({ x: 3.2, z: 4, kind: 'floor-trap' })
  })

  it('gives a shower a 1000 mm wall take-off, and only while hdbScaleAudit is on', () => {
    // HDB-SCALE-AUDIT: BCA COA 2025 cl. 5.8.9 puts a shower slide bar's lower end at
    // 900-1100 mm AFFL; the generic 600 mm water point was knee height in a wet room.
    const catalog = { shower: def('shower', 'bathroom') }
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
    expect(derivePlumbingPoints([item('shower', 2, 2)], catalog)).toContainEqual({
      x: 2.2,
      z: 2,
      kind: 'water-point',
      mountHeightMm: 1000,
    })
    // Flag off restores the generic default (no explicit height on the point at all).
    setResolvedFlags(resolveFlags(true, { hdbScaleAudit: false }, false, 'simple'))
    expect(derivePlumbingPoints([item('shower', 2, 2)], catalog)).toContainEqual({
      x: 2.2,
      z: 2,
      kind: 'water-point',
    })
    setResolvedFlags(resolveFlags(false, {}, false, 'simple'))
  })

  it('leaves every other fixture on the per-kind default height', () => {
    // Only the washer (1150) and the shower (1000) carry an explicit height; a basin, a
    // kitchen sink and a WC cistern all take the 600 mm `water-point` default.
    const catalog = {
      sink: def('sink', 'kitchen'),
      toilet: def('toilet', 'bathroom'),
      'bathroom-sink': def('bathroom-sink', 'bathroom'),
    }
    const pts = derivePlumbingPoints(
      [item('sink', 1, 1), item('toilet', 3, 3), item('bathroom-sink', 4, 4)],
      catalog,
    )
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.every((p) => p.mountHeightMm === undefined)).toBe(true)
  })

  it('tags a plumbing point with its item level', () => {
    const catalog = { toilet: def('toilet', 'bathroom') }
    const pts = derivePlumbingPoints([item('toilet', 2, 2, 'up')], catalog)
    expect(pts.every((p) => p.levelId === 'up')).toBe(true)
  })
})
