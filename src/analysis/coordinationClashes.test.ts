import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import type { FloorPlan, PlanElectricalPoint } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildCoordinationClashes } from './coordinationClashes'

/** One 6 x 4 m room at the origin, flat ceiling (no clearance zones). */
function plan(over: Partial<FloorPlan> = {}): FloorPlan {
  return {
    name: 'Test',
    extent: [6, 4],
    ceilingHeight: 2.6,
    walls: [],
    rooms: [
      {
        id: 'r1',
        name: 'Living',
        origin: [0, 0],
        width: 6,
        depth: 4,
      },
    ],
    ...over,
  } as unknown as FloorPlan
}

/** A 1 x 0.6 m item; `h` is its height in metres. */
function def(h: number, over: Partial<FurnitureDef> = {}): FurnitureDef {
  return {
    id: 'wardrobe',
    name: 'Wardrobe',
    category: 'storage',
    kind: 'primitive',
    defaultFootprint: { w: 1, d: 0.6, h },
    ...over,
  } as unknown as FurnitureDef
}

function item(over: Partial<FurnitureItem> = {}): FurnitureItem {
  return {
    id: 'i1',
    defId: 'wardrobe',
    position: [2, 2],
    rotation: 0,
    props: {},
    ...over,
  } as unknown as FurnitureItem
}

function socket(over: Partial<PlanElectricalPoint> = {}): PlanElectricalPoint {
  return { id: 'e1', x: 2, z: 2, kind: 'socket', ...over } as PlanElectricalPoint
}

describe('buildCoordinationClashes — MEP behind furniture', () => {
  it('flags a socket inside the footprint of a tall item', () => {
    const r = buildCoordinationClashes(plan(), [item()], { wardrobe: def(2.1) }, [socket()])
    expect(r.clashes).toHaveLength(1)
    expect(r.clashes[0]!.kind).toBe('mep-behind-furniture')
    expect(r.clashes[0]!.severity).toBe('high')
    expect(r.clashes[0]!.pointId).toBe('e1')
    expect(r.clashes[0]!.itemId).toBe('i1')
    expect(r.allClear).toBe(false)
    expect(r.highCount).toBe(1)
  })

  it('names both sides of the clash and the room', () => {
    const r = buildCoordinationClashes(plan(), [item()], { wardrobe: def(2.1) }, [socket()])
    expect(r.clashes[0]!.title).toContain('socket')
    expect(r.clashes[0]!.title).toContain('Wardrobe')
    expect(r.clashes[0]!.roomName).toBe('Living')
  })

  it('does NOT flag a socket above a low item — a sideboard does not bury it', () => {
    // Default socket mount is ~300 mm AFFL, so raise the point above the item.
    const r = buildCoordinationClashes(plan(), [item()], { wardrobe: def(0.4) }, [
      socket({ mountHeightMm: 1100 }),
    ])
    expect(r.clashes).toEqual([])
    expect(r.allClear).toBe(true)
  })

  it('flags the same point once even when it sits under a tall item', () => {
    const r = buildCoordinationClashes(
      plan(),
      [item(), item({ id: 'i2' })],
      { wardrobe: def(2.1) },
      [socket()],
    )
    expect(r.clashes).toHaveLength(1)
  })

  it('does NOT flag a point outside every footprint', () => {
    const r = buildCoordinationClashes(plan(), [item()], { wardrobe: def(2.1) }, [
      socket({ x: 5.5, z: 3.5 }),
    ])
    expect(r.clashes).toEqual([])
  })

  it('honours item rotation when testing containment', () => {
    // The item is 1.0 wide x 0.6 deep at (2,2). A point at (2, 2.4) is OUTSIDE
    // unrotated (|dz| 0.4 > 0.3) but INSIDE once turned 90 degrees (half-width
    // 0.5 now runs along z).
    const away = buildCoordinationClashes(plan(), [item()], { wardrobe: def(2.1) }, [
      socket({ z: 2.4 }),
    ])
    expect(away.clashes).toEqual([])
    const turned = buildCoordinationClashes(
      plan(),
      [item({ rotation: Math.PI / 2 })],
      { wardrobe: def(2.1) },
      [socket({ z: 2.4 })],
    )
    expect(turned.clashes).toHaveLength(1)
  })

  it('checks plumbing points too, labelled as such', () => {
    const r = buildCoordinationClashes(
      plan(),
      [item()],
      { wardrobe: def(2.1) },
      [],
      [{ id: 'p1', x: 2, z: 2, kind: 'basin' } as never],
    )
    expect(r.clashes).toHaveLength(1)
    expect(r.clashes[0]!.title).toContain('Plumbing')
  })

  it('reports what it compared, so "0 clashes" is distinguishable from "nothing to check"', () => {
    const none = buildCoordinationClashes(plan(), [], {})
    expect(none.allClear).toBe(true)
    expect(none.checked).toEqual({ mepPoints: 0, items: 0 })
    const some = buildCoordinationClashes(plan(), [item()], { wardrobe: def(0.4) }, [
      socket({ mountHeightMm: 1100 }),
    ])
    expect(some.allClear).toBe(true)
    expect(some.checked).toEqual({ mepPoints: 1, items: 1 })
  })

  it('skips an item whose def is missing, rather than throwing', () => {
    expect(() => buildCoordinationClashes(plan(), [item()], {}, [socket()])).not.toThrow()
    expect(buildCoordinationClashes(plan(), [item()], {}, [socket()]).clashes).toEqual([])
  })

  it('never NaNs on an empty plan with no points', () => {
    const r = buildCoordinationClashes(plan({ rooms: [] } as never), [], {})
    expect(r.clashes).toEqual([])
    expect(r.highCount).toBe(0)
  })
})

describe('coordinationChecks flag', () => {
  it('is a pro-tier flag, on by default', () => {
    const flag = FEATURE_FLAGS['coordinationChecks']
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('pro')
    expect(flag.default).toBe(true)
  })

  it('is OFF in Simple mode and ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'simple').coordinationChecks).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').coordinationChecks).toBe(true)
  })
})

describe('report integration', () => {
  it('renders a Coordination section in Pro and omits it in Simple', async () => {
    const { buildReportHtml } = await import('../ui/report')
    const { useStore } = await import('../state/store')
    const p = plan({
      electricalPoints: [socket()],
    } as never)
    const catalog = { wardrobe: def(2.1) }

    // setUiMode reresolves the flags internally.
    useStore.getState().setUiMode('pro')
    const pro = buildReportHtml(p, [item()], catalog, null)
    expect(pro).toContain('Coordination')
    expect(pro).toContain('Wardrobe')

    useStore.getState().setUiMode('simple')
    const simple = buildReportHtml(p, [item()], catalog, null)
    expect(simple).not.toContain('<h2>Coordination</h2>')

    useStore.getState().setUiMode('pro')
  })
})
