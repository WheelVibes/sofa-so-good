import { describe, expect, it } from 'vitest'
import type { FloorPlan, PlanRoom } from '../floorplan/types'
import type { FurnitureCategory, FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildHandoverChecklist } from './handoverChecklist'

// --- Minimal fixtures -------------------------------------------------------

const room = (id: string, name: string, extra: Partial<PlanRoom> = {}): PlanRoom => ({
  id,
  name,
  origin: [0, 0],
  width: 3,
  depth: 3,
  ...extra,
})

const planWith = (rooms: PlanRoom[]): FloorPlan =>
  ({
    name: 'Test',
    rooms,
    walls: [],
    openings: [],
    ceilingHeight: 2.6,
  }) as unknown as FloorPlan

const def = (id: string, category: FurnitureCategory): FurnitureDef =>
  ({
    id,
    name: id,
    category,
    kind: 'parametric',
    primitive: 'box',
    paramSchema: [],
    defaultFootprint: { w: 1, d: 1, h: 1 },
  }) as unknown as FurnitureDef

const item = (id: string, defId: string): FurnitureItem => ({
  id,
  defId,
  position: [1, 1],
  rotation: 0,
  props: {},
})

const labels = (groups: ReturnType<typeof buildHandoverChecklist>['groups']): string[] =>
  groups.flatMap((g) => g.items.map((i) => i.label))

describe('buildHandoverChecklist', () => {
  it('always includes the generic key-handover group, even for an empty plan', () => {
    const result = buildHandoverChecklist(planWith([]), [], {})
    // Exactly one group — the generic handover bucket — and no room/appliance groups.
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]!.kind).toBe('generic')
    expect(result.groups[0]!.title).toBe('Keys, meters & documents')
    const all = labels(result.groups)
    expect(all.some((l) => /keys/i.test(l))).toBe(true)
    expect(all.some((l) => /meter readings/i.test(l))).toBe(true)
    expect(result.totalItems).toBe(result.groups[0]!.items.length)
  })

  it('fires kind-specific snag rules per room kind', () => {
    const result = buildHandoverChecklist(
      planWith([room('k', 'Kitchen'), room('b', 'Bathroom'), room('br', 'Master Bedroom')]),
      [],
      {},
    )
    const byTitle = (t: string) => result.groups.find((g) => g.title === t)!
    // Kitchen: water-stop valves + cooker hood are kitchen-only rules.
    const kitchen = labels([byTitle('Kitchen')])
    expect(kitchen.some((l) => /water-stop valves/i.test(l))).toBe(true)
    expect(kitchen.some((l) => /cooker-hood/i.test(l))).toBe(true)
    // Bath: waterproofing fall + sanitary fixtures.
    const bath = labels([byTitle('Bathroom')])
    expect(bath.some((l) => /waterproofing/i.test(l))).toBe(true)
    expect(bath.some((l) => /WC, basin/i.test(l))).toBe(true)
    // Bedroom: aircon + wardrobe.
    const bed = labels([byTitle('Master Bedroom')])
    expect(bed.some((l) => /aircon/i.test(l))).toBe(true)
    expect(bed.some((l) => /wardrobe/i.test(l))).toBe(true)
    // Each room group carries the shared common rules too.
    expect(kitchen.some((l) => /Power points/i.test(l))).toBe(true)
  })

  it('puts a room with no recognised kind in a generic room bucket (common rules only)', () => {
    const result = buildHandoverChecklist(planWith([room('x', 'Flex Space')]), [], {})
    const roomGroup = result.groups.find((g) => g.kind === 'room')!
    expect(roomGroup.title).toBe('Flex Space')
    // Only the 4 common rules — no kind-specific extras.
    expect(roomGroup.items).toHaveLength(4)
    expect(labels([roomGroup]).some((l) => /Walls & ceiling/i.test(l))).toBe(true)
  })

  it('honours an explicit room category over the name (RM1)', () => {
    // "Ella's room" infers to 'other' (common rules only); an explicit bedroom
    // category pulls the bedroom snag rules (aircon + wardrobe).
    const withCat = buildHandoverChecklist(
      planWith([{ ...room('kr', "Ella's room"), category: 'bedroom' }]),
      [],
      {},
    )
    const kids = withCat.groups.find((g) => g.title === "Ella's room")!
    expect(labels([kids]).some((l) => /wardrobe/i.test(l))).toBe(true)
    expect(labels([kids]).some((l) => /aircon/i.test(l))).toBe(true)

    // Without the category the same name gets only the common rules (unchanged).
    const plain = buildHandoverChecklist(planWith([room('kr', "Ella's room")]), [], {})
    const plainGrp = plain.groups.find((g) => g.title === "Ella's room")!
    expect(plainGrp.items).toHaveLength(4)
  })

  it('adds appliance-activation items for the appliance categories actually present', () => {
    const catalog: Record<string, FurnitureDef> = {
      washer: def('washer', 'laundry'),
      tv: def('tv', 'electronics'),
      sofa: def('sofa', 'seating'),
    }
    const result = buildHandoverChecklist(
      planWith([room('lr', 'Living Room')]),
      [item('i1', 'washer'), item('i2', 'tv'), item('i3', 'sofa')],
      catalog,
    )
    const appliances = result.groups.find((g) => g.kind === 'appliances')
    expect(appliances).toBeDefined()
    const al = labels([appliances!])
    expect(al.some((l) => /Washer \/ dryer/i.test(l))).toBe(true)
    expect(al.some((l) => /TV, network and AV/i.test(l))).toBe(true)
    // Seating is not an appliance category → no extra activation line for it.
    expect(al).toHaveLength(2)
  })

  it('omits the appliance group when no appliance category is present', () => {
    const catalog: Record<string, FurnitureDef> = { sofa: def('sofa', 'seating') }
    const result = buildHandoverChecklist(
      planWith([room('lr', 'Living')]),
      [item('i1', 'sofa')],
      catalog,
    )
    expect(result.groups.some((g) => g.kind === 'appliances')).toBe(false)
  })

  it('ignores items whose def is missing from the catalog', () => {
    const result = buildHandoverChecklist(
      planWith([room('lr', 'Living')]),
      [item('i1', 'ghost')],
      {},
    )
    expect(result.groups.some((g) => g.kind === 'appliances')).toBe(false)
  })

  it('orders groups: rooms (plan order) → appliances → generic, generic last', () => {
    const catalog: Record<string, FurnitureDef> = { hob: def('hob', 'kitchen') }
    const result = buildHandoverChecklist(
      planWith([room('a', 'Kitchen'), room('b', 'Bedroom')]),
      [item('i1', 'hob')],
      catalog,
    )
    const kinds = result.groups.map((g) => g.kind)
    expect(kinds).toEqual(['room', 'room', 'appliances', 'generic'])
    expect(result.groups[0]!.title).toBe('Kitchen')
    expect(result.groups[1]!.title).toBe('Bedroom')
  })

  it('is deterministic — identical input yields identical output', () => {
    const catalog: Record<string, FurnitureDef> = {
      hob: def('hob', 'kitchen'),
      tv: def('tv', 'electronics'),
    }
    const plan = planWith([room('k', 'Kitchen'), room('lr', 'Living / Dining')])
    const items = [item('i1', 'hob'), item('i2', 'tv')]
    const a = buildHandoverChecklist(plan, items, catalog)
    const b = buildHandoverChecklist(plan, items, catalog)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('gives every checklist line a unique, stable id', () => {
    const catalog: Record<string, FurnitureDef> = { hob: def('hob', 'kitchen') }
    const result = buildHandoverChecklist(
      planWith([room('k', 'Kitchen'), room('b', 'Bath')]),
      [item('i1', 'hob')],
      catalog,
    )
    const ids = result.groups.flatMap((g) => g.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('adds a warranty-dates group only when a key-collection date is given (R4-8)', () => {
    const plan = planWith([room('l', 'Living')])
    const without = buildHandoverChecklist(plan, [], {})
    expect(without.groups.some((g) => g.title === 'Warranty & defect dates')).toBe(false)

    const withDate = buildHandoverChecklist(plan, [], {}, '2026-07-19')
    const dates = withDate.groups.find((g) => g.title === 'Warranty & defect dates')
    expect(dates).toBeDefined()
    expect(dates?.items).toHaveLength(3)
    // The computed DLP end (+1yr) appears in a line.
    expect(dates?.items.some((i) => i.label.includes('19 Jul 2027'))).toBe(true)
  })

  it('ignores a malformed key-collection date', () => {
    const plan = planWith([room('l', 'Living')])
    const r = buildHandoverChecklist(plan, [], {}, 'not-a-date')
    expect(r.groups.some((g) => g.title === 'Warranty & defect dates')).toBe(false)
  })
})
