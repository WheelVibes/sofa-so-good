/**
 * Wall elevations across every storey (F13).
 *
 * `projectAllElevations` mapped `plan.walls` — the ground floor only — so an
 * upper storey's walls had NO elevation drawing anywhere: not in the Elevations
 * panel, not in the report, not in the drawing set. And items were passed
 * through unfiltered, so an upstairs piece near a ground wall's line was drawn
 * standing against that ground wall.
 *
 * Verified to FAIL without the fix.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { projectAllElevations } from './projectElevation'

/**
 * Ground and upper each have ONE wall along x at z = 0. The upper storey's
 * ceiling is 2.2 m against the ground's 3.0 m, so a wall measured against the
 * wrong storey's height is detectable.
 */
function maisonette(): FloorPlan {
  return {
    id: 'p',
    name: 'p',
    extent: [6, 4],
    ceilingHeight: 3,
    walls: [{ id: 'g-n', start: [0, 0], end: [6, 0], thickness: 'external' }],
    openings: [
      { id: 'g-d', wallId: 'g-n', kind: 'door', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    ],
    rooms: [{ id: 'g-live', name: 'Living', origin: [0, 0], width: 6, depth: 4 }],
    upperLevels: [
      {
        id: 'upper',
        name: 'Upper',
        elevation: 3.2,
        ceilingHeight: 2.2,
        walls: [{ id: 'u-n', start: [0, 0], end: [6, 0], thickness: 'external' }],
        openings: [
          { id: 'u-w', wallId: 'u-n', kind: 'window', offset: 2, width: 1.2, sill: 0.9, head: 2 },
        ],
        rooms: [{ id: 'u-bed', name: 'Bedroom', origin: [0, 0], width: 6, depth: 4 }],
      },
    ],
  } as unknown as FloorPlan
}

const DEFS: Record<string, FurnitureDef> = {
  chest: {
    id: 'chest',
    name: 'Chest',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 1, d: 0.4, h: 0.8 },
  } as unknown as FurnitureDef,
}

/** Standing against the z = 0 wall line, on the given storey. */
const chest = (id: string, levelId?: string): FurnitureItem =>
  ({
    id,
    defId: 'chest',
    position: [3, 0.25],
    rotation: 0,
    props: {},
    ...(levelId ? { levelId } : {}),
  }) as unknown as FurnitureItem

describe('projectAllElevations — every storey', () => {
  it('produces an elevation for an UPPER-storey wall', () => {
    const els = projectAllElevations(maisonette(), [], DEFS)
    expect(els.map((e) => e.wallId).sort()).toEqual(['g-n', 'u-n'])
  })

  it('measures each wall against ITS OWN storey ceiling height', () => {
    const els = projectAllElevations(maisonette(), [], DEFS)
    expect(els.find((e) => e.wallId === 'g-n')!.height).toBeCloseTo(3, 6)
    // Not the ground's 3.0 — the upper storey is 2.2 m.
    expect(els.find((e) => e.wallId === 'u-n')!.height).toBeCloseTo(2.2, 6)
  })

  it('gives each wall only ITS OWN storey openings', () => {
    const els = projectAllElevations(maisonette(), [], DEFS)
    expect(els.find((e) => e.wallId === 'g-n')!.openings.map((o) => o.kind)).toEqual(['door'])
    expect(els.find((e) => e.wallId === 'u-n')!.openings.map((o) => o.kind)).toEqual(['window'])
  })

  it('tags each elevation with its storey', () => {
    const els = projectAllElevations(maisonette(), [], DEFS)
    expect(els.find((e) => e.wallId === 'u-n')!.levelId).toBe('upper')
    expect(els.find((e) => e.wallId === 'u-n')!.levelName).toBe('Upper')
    expect(els.find((e) => e.wallId === 'g-n')!.levelId).toBe('ground')
  })
})

describe('projectAllElevations — items are level-gated', () => {
  it('does not draw an upstairs piece against a ground wall', () => {
    // Both walls sit on the same z = 0 line, so an unfiltered item list put the
    // upstairs chest against BOTH.
    const els = projectAllElevations(maisonette(), [chest('c', 'upper')], DEFS)
    expect(els.find((e) => e.wallId === 'g-n')!.items).toEqual([])
    expect(els.find((e) => e.wallId === 'u-n')!.items.map((i) => i.id)).toEqual(['c'])
  })

  it('draws a ground piece against the ground wall only', () => {
    const els = projectAllElevations(maisonette(), [chest('c')], DEFS)
    expect(els.find((e) => e.wallId === 'g-n')!.items.map((i) => i.id)).toEqual(['c'])
    expect(els.find((e) => e.wallId === 'u-n')!.items).toEqual([])
  })
})

describe('elevationCaption — storey tag', () => {
  it('tags a non-ground storey and leaves ground untagged', async () => {
    const { elevationCaption } = await import('../ui/elevation/elevationSvg')
    const els = projectAllElevations(maisonette(), [], DEFS)
    const up = elevationCaption(els.find((e) => e.wallId === 'u-n')!, 1, 'metric')
    const gnd = elevationCaption(els.find((e) => e.wallId === 'g-n')!, 0, 'metric')
    expect(up).toContain('Upper')
    // An untagged caption means ground — stamping "Ground floor" on every
    // single-storey caption would be noise.
    expect(gnd).not.toContain('Ground')
  })
})
