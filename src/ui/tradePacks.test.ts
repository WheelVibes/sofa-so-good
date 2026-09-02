import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from '../features/flags/registry'
import { resolveFlags } from '../features/flags/resolve'
import { buildDefaultPlan } from '../floorplan/defaultPlan'
import type { RoomFinishMaps } from '../floorplan/roomFinishes'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { defaultLayout } from '../furniture/defaultLayout'
import { defaultParamProps } from '../furniture/types'
import { buildDrawingSheets } from './drawingSet'
import { buildTradePack, NUMBERING_NOTE, TRADE_PACKS, type TradePackInput } from './tradePacks'

/** Rich fixture: the furnished 4-room default — a sofa (upholstery), curtains,
 *  a wardrobe + kitchen run (built-ins) and an aircon FCU. */
const plan = buildDefaultPlan()
const items = defaultLayout().map((e) => {
  const d = BUILTIN_CATALOG[e.defId]
  return d?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(d), ...e.props } } : e
})
const finishes: RoomFinishMaps = { floor: {}, walls: {} }

const fullInput: TradePackInput = {
  plan,
  items,
  catalog: BUILTIN_CATALOG,
  finishes,
  electrical: {
    points: [
      { x: 1, z: 1, kind: 'socket' },
      { x: 2, z: 1, kind: 'switch' },
    ],
    source: 'heuristic',
  },
  plumbing: { points: [{ x: 1, z: 1, kind: 'water-point' }], source: 'heuristic' },
  showCarpentry: true,
  showRcp: true,
}

/** Master sheet number for the first sheet of a callout group. */
function masterNum(group: string): string | undefined {
  const { sheets } = buildDrawingSheets(
    fullInput.plan,
    fullInput.items,
    fullInput.catalog,
    'metric',
    fullInput.baselinePlan,
    fullInput.electrical,
    fullInput.plumbing,
    fullInput.finishes,
    undefined,
    undefined,
    undefined,
    0,
    fullInput.showSettingOut ?? false,
    fullInput.showCarpentry ?? false,
    fullInput.showRcp ?? false,
  )
  return sheets.find((s) => s.calloutGroup === group)?.num
}

describe('tradePacks — flag', () => {
  it('is a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.tradePacks
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })
  it('is ON in Pro and forced OFF in Simple', () => {
    expect(resolveFlags(false, {}, false, 'pro').tradePacks).toBe(true)
    expect(resolveFlags(false, {}, false, 'simple').tradePacks).toBe(false)
  })
})

describe('tradePacks — composition (all systems present)', () => {
  it('registers the seven recipient packs', () => {
    expect(TRADE_PACKS.map((p) => p.id)).toEqual([
      'tiler',
      'electrician',
      'plumber',
      'carpenter',
      'aircon',
      'curtains',
      'painter',
    ])
  })

  it('tiler bundles the floor plan + finishes, and NEVER the FF&E / upholstery', () => {
    const pack = buildTradePack('tiler', fullInput)
    const names = pack.includedSheets.map((s) => s.name)
    expect(names.some((n) => n.startsWith('Floor plan'))).toBe(true)
    expect(names).toContain('Finishes schedule')
    // No FF&E sheet, so the "3-seat sofa" (upholstery) never appears in the pack.
    expect(names.some((n) => n.includes('FF&E'))).toBe(false)
    expect(pack.html).not.toContain('FF&amp;E schedule')
    expect(pack.html).not.toContain('3-seat sofa')
    // Its finish schedule is floors + walls only — no Ceiling column.
    expect(pack.html).toContain('>Floor<')
    expect(pack.html).toContain('>Wall (net of openings)<')
    expect(pack.html).not.toContain('>Ceiling<')
  })

  it('electrician bundles the electrical plan + mount-height conventions + DB note', () => {
    const pack = buildTradePack('electrician', fullInput)
    expect(pack.includedSheets.some((s) => s.name.startsWith('Electrical plan'))).toBe(true)
    expect(pack.html).toContain('Mount-height conventions')
    expect(pack.html).toContain('1200 mm') // switch default AFFL
    expect(pack.html).toContain('SP Group') // DB-load note
  })

  it('plumber bundles the plumbing plan', () => {
    const pack = buildTradePack('plumber', fullInput)
    expect(pack.includedSheets.some((s) => s.name.startsWith('Plumbing plan'))).toBe(true)
  })

  it('carpenter bundles wall elevations + a built-in joinery summary', () => {
    const pack = buildTradePack('carpenter', fullInput)
    // Elevations always exist for content-bearing walls in the furnished flat.
    expect(pack.includedSheets.length).toBeGreaterThan(0)
    expect(pack.html).toContain('Built-in / joinery schedule')
  })

  it('aircon shows the System proposal + FCU rooms, reusing the floor plan + electrical', () => {
    const pack = buildTradePack('aircon', fullInput)
    expect(pack.html).toContain('Proposed multi-split systems')
    expect(pack.html).toMatch(/System-\d|Single split/)
    expect(pack.includedSheets.some((s) => s.name.startsWith('Floor plan'))).toBe(true)
  })

  it('curtains lists placed window treatments + the window schedule', () => {
    const pack = buildTradePack('curtains', fullInput)
    expect(pack.html).toContain('Window treatments (placed)')
    expect(pack.html).toContain('Curtains')
    expect(pack.includedSheets.some((s) => s.name === 'Door & window schedule')).toBe(true)
  })

  it('painter bundles a walls-only finish schedule + paint LITRES', () => {
    const pack = buildTradePack('painter', fullInput)
    expect(pack.includedSheets).toEqual([expect.objectContaining({ name: 'Finishes schedule' })])
    // v0.31.5.292: this used to print an area and tell the painter to "add
    // ceilings + a coverage/coats factor per the paint spec" — the arithmetic
    // the app has every input for. Now it prints litres and what to buy.
    expect(pack.html).toContain('Paint quantities')
    expect(pack.html).toMatch(/\d+(\.\d+)? L/)
    expect(pack.html).toContain('EXCLUDE wastage')
    expect(pack.html).toContain('product data sheet')
    expect(pack.html).not.toContain('Paint-area quantity basis')
    // Walls only — no floor column in the finish schedule.
    expect(pack.html).not.toContain('>Floor<')
    expect(pack.html).toContain('>Wall (net of openings)<')
  })
})

describe('tradePacks — master numbering is preserved', () => {
  it('each pack sheet keeps its master A-N number', () => {
    const tiler = buildTradePack('tiler', fullInput)
    const floorSheet = tiler.includedSheets.find((s) => s.name.startsWith('Floor plan'))
    expect(floorSheet?.num).toBe(masterNum('floor-plan'))

    const elec = buildTradePack('electrician', fullInput)
    const elecSheet = elec.includedSheets.find((s) => s.name.startsWith('Electrical plan'))
    expect(elecSheet?.num).toBe(masterNum('electrical'))

    // Numbers are the master set's — non-contiguous within a pack — and the
    // convention is stated on the cover.
    expect(tiler.html).toContain(NUMBERING_NOTE)
    // Title-block "of N" uses the MASTER total, not the pack's own count.
    const { sheets } = buildDrawingSheets(
      fullInput.plan,
      fullInput.items,
      fullInput.catalog,
      'metric',
      undefined,
      fullInput.electrical,
      fullInput.plumbing,
      fullInput.finishes,
      undefined,
      undefined,
      undefined,
      0,
      false,
      true,
      true,
    )
    expect(tiler.html).toContain(`of ${sheets.length + 1}`)
  })
})

describe('tradePacks — honest exclusions when data is missing', () => {
  const bare: TradePackInput = { plan, items: [], catalog: BUILTIN_CATALOG }

  it('electrician notes the missing electrical plan + switching schematic', () => {
    const pack = buildTradePack('electrician', bare)
    expect(pack.exclusions.some((e) => /electrical plan/i.test(e))).toBe(true)
    expect(pack.exclusions.some((e) => /switching schematic/i.test(e))).toBe(true)
    expect(pack.html).toContain('Not included / to complete first')
  })

  it('aircon notes FCU/condenser positions are not on the plan when unplaced', () => {
    const pack = buildTradePack('aircon', { plan, items: [], catalog: BUILTIN_CATALOG })
    expect(pack.exclusions.some((e) => /FCU \/ condenser positions/i.test(e))).toBe(true)
  })

  it('curtains notes no treatments placed', () => {
    const pack = buildTradePack('curtains', bare)
    expect(pack.exclusions.some((e) => /no window treatments/i.test(e))).toBe(true)
  })

  it('painter falls back gracefully with no finishes', () => {
    const pack = buildTradePack('painter', bare)
    expect(pack.exclusions.some((e) => /wall finish schedule/i.test(e))).toBe(true)
  })
})

describe('curtains pack carries a SPECIFICATION, not just footprints', () => {
  it('prints per-window drops and fabric widths', () => {
    const pack = buildTradePack('curtains', fullInput)
    // v0.31.5.303: the placed list gives each fixture's rendered footprint,
    // which its own caveat admitted is not an order dimension. A maker needs
    // the drop and the fabric width.
    expect(pack.html).toContain('Curtain specification')
    expect(pack.html).toContain('Floor drop')
    expect(pack.html).toMatch(/Fabric @2x \/ 2\.5x/)
    // The assumption and the omission both travel with it.
    expect(pack.html).toMatch(/confirm the actual track height/i)
    expect(pack.html).toMatch(/installer/i)
  })

  it('resolves every window to a real room — not "Unassigned"', () => {
    // `roomsAcrossOpening`'s 4th argument is the PROBE DISTANCE perpendicular
    // to the wall; every other caller passes a 0.2 m constant. Passing
    // `PlanOpening.offset` — an ALONG-WALL position, spelled the same and also
    // a `number` — probes a metre or more into the room. Measured on the
    // default flat with the argument swapped and the swap VERIFIED to have
    // landed:
    //
    //   0.2 m constant → Main Bedroom, Bedroom 2, Bedroom 3, Living / Dining,
    //                    AC Ledge, Bath/WC 2
    //   `o.offset`     → Main Bedroom, Unassigned, Unassigned, Living / Dining,
    //                    AC Ledge, Corridor
    //
    // Nothing but a rendered document distinguishes the two arguments: the
    // compiler cannot, and neither can a reviewer reading the call.
    const pack = buildTradePack('curtains', fullInput)
    const at = pack.html.indexOf('Curtain specification')
    const table = pack.html.slice(at, pack.html.indexOf('</table>', at))
    const rooms = [...table.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1])
    expect(rooms.length).toBeGreaterThan(0)
    expect(rooms).not.toContain('Unassigned')
    // And the rooms agree with the door/window schedule's own attribution.
    expect(rooms).toContain('Main Bedroom')
    expect(rooms).toContain('Bedroom 2')
    expect(rooms).toContain('Bedroom 3')
  })

  it('no longer claims the footprint is a measurement basis', () => {
    const pack = buildTradePack('curtains', fullInput)
    expect(pack.html).toContain('not an order dimension')
  })
})
