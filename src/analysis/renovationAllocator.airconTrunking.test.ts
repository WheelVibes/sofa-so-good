import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanOpening, PlanRoom, PlanWall } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildRenovationAllocation } from './renovationAllocator'
import { DEFAULT_PRICE_RULES } from './renovationCost'

/** A single served room (living, with an attached AC ledge) — the smallest
 *  plan the router can resolve a route on (condenser room ↔ FCU room via a
 *  door). Mirrors the fixture shape in `rcp.test.ts`'s trunking describe. */
function trunkingPlan(): FloorPlan {
  const rooms: PlanRoom[] = [
    {
      id: 'living',
      name: 'Living / Dining',
      origin: [0, 0],
      width: 5,
      depth: 4,
      category: 'living',
    },
    { id: 'ledge', name: 'AC Ledge', origin: [0, -1.2], width: 5, depth: 1.2, category: 'other' },
  ]
  const walls: PlanWall[] = [
    { id: 'liv-n', start: [0, 0], end: [5, 0], thickness: 'internal' },
    { id: 'liv-s', start: [0, 4], end: [5, 4], thickness: 'internal' },
    { id: 'liv-w', start: [0, 0], end: [0, 4], thickness: 'internal' },
    { id: 'liv-e', start: [5, 0], end: [5, 4], thickness: 'internal' },
    { id: 'ledge-n', start: [0, -1.2], end: [5, -1.2], thickness: 'external' },
    { id: 'ledge-w', start: [0, -1.2], end: [0, 0], thickness: 'internal' },
    { id: 'ledge-e', start: [5, -1.2], end: [5, 0], thickness: 'internal' },
  ]
  const openings: PlanOpening[] = [
    { id: 'd1', kind: 'door', wallId: 'liv-n', offset: 1, width: 1, sill: 0, head: 2.1 },
  ]
  return {
    id: 't2',
    name: 't2',
    ceilingHeight: 2.8,
    extent: [5, 5.2],
    walls,
    openings,
    rooms,
  }
}

const base = {
  plan: trunkingPlan(),
  items: [] as FurnitureItem[],
  catalog: {} as Record<string, FurnitureDef>,
  floorFinishes: { living: 'oak-wood' } as Record<string, string>,
  wallFinishes: {} as Record<string, string>,
  rules: DEFAULT_PRICE_RULES,
}

describe('renovationAllocator — aircon trunking sub-line (BSJ-2 follow-up)', () => {
  it('omits the trunking line when the flag input is off (no regression)', () => {
    const alloc = buildRenovationAllocation({ ...base, airconTrunking: false })
    expect(alloc.lines.find((l) => l.id === 'aircon-trunking')).toBeUndefined()
    // The flat per-FCU aircon line is present + unchanged by the flag.
    expect(alloc.lines.find((l) => l.id === 'aircon')).toBeDefined()
  })

  it('adds a trunking line = modeled route length × rate when the flag is on', () => {
    const alloc = buildRenovationAllocation({ ...base, airconTrunking: true })
    const trunking = alloc.lines.find((l) => l.id === 'aircon-trunking')
    expect(trunking).toBeDefined()
    expect(trunking!.quantity).toBeGreaterThan(0)
    expect(trunking!.unit).toBe('lin.m')
    expect(trunking!.rate).toBeCloseTo(DEFAULT_PRICE_RULES.trades.airconTrunkingPerM)
    expect(trunking!.subtotal).toBeCloseTo(trunking!.quantity * trunking!.rate, 0)
    expect(trunking!.stage).toBe('Plumbing/electrical fit-out')

    // The flat per-FCU aircon line is unchanged vs the flag-off run.
    const off = buildRenovationAllocation({ ...base, airconTrunking: false })
    expect(alloc.lines.find((l) => l.id === 'aircon')!.subtotal).toBe(
      off.lines.find((l) => l.id === 'aircon')!.subtotal,
    )
  })

  it('omits the trunking line when no route resolves (no door, no shared boundary)', () => {
    // No door AND the ledge set back so its footprint shares NO boundary span
    // with living (the wall-drill fallback needs a touching/near-touching
    // span — see `airconTrunking.ts`'s `EDGE_TOUCH_EPS`) — a genuinely
    // unreachable condenser.
    const base2 = trunkingPlan()
    const isolated: FloorPlan = {
      ...base2,
      rooms: base2.rooms.map((r) =>
        r.id === 'ledge' ? { ...r, origin: [0, -3.2] as [number, number] } : r,
      ),
      openings: [],
    }
    const alloc = buildRenovationAllocation({
      ...base,
      plan: isolated,
      airconTrunking: true,
    })
    expect(alloc.lines.find((l) => l.id === 'aircon-trunking')).toBeUndefined()
  })
})
