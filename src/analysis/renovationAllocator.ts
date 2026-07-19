/**
 * Whole-renovation budget allocator (BSJ-1) — the blank-slate owner's #1 anxiety:
 * "what will my reno cost, stage by stage". Where `renovationCost.ts` prices only
 * floor + wall FINISHES, this derives a full SG renovation TRADE breakdown from
 * the design's OWN quantities (no manual entry): hacking, masonry/wet works
 * (tiling), flooring, carpentry, ceiling works, painting, M&E points, aircon,
 * glass & aluminium and plumbing fixtures, plus a contingency line.
 *
 * ## One source of truth for every rate
 * Every rate comes from the user-editable `PriceRules` card (`renovationCost.ts`):
 * tiling/flooring reuse the `floor.*` buckets, tiling walls + painting reuse the
 * `wall.*` buckets, carpentry reuses `carpentryPerM`, and the trades that had no
 * prior rate (hacking, ceiling, M&E, aircon, glass, plumbing fixtures,
 * contingency) come from the additive `trades` sub-card. No parallel rate table.
 *
 * ## Quantity bases (all derived, never entered)
 * - Hacking: demolished-wall length (`demolitionPlan.diffWalls` vs. the baseline).
 * - Masonry & wet works: wet-room (bath/powder/kitchen) floor + wall tiling area.
 * - Flooring: dry-room floor area, grouped/priced by finish bucket.
 * - Carpentry: linear metres of placed cabinet/wardrobe/counter/vanity runs.
 * - Ceiling works: floor area of rooms with a non-flat ceiling treatment.
 * - Painting: dry-room gross wall area net of opening area.
 * - M&E: authored electrical + plumbing point count.
 * - Aircon: indoor-FCU count from the per-room BTU sizing (`airconSizing`).
 * - Glass & aluminium: placed shower-screen / glass-partition panel area.
 * - Plumbing fixtures: placed sanitary/kitchen fixture count.
 *
 * Pure + unit-testable. Rates are indicative SG mid-market 2025-26 figures
 * (9creation / Qanvast / RCS) — the UI labels the total an estimate.
 */

import { diffWalls } from '../floorplan/demolitionPlan'
import { roomCategory } from '../floorplan/roomCategory'
import { type FloorPlan, type PlanRoom, planRoomArea, planRoomPerimeter } from '../floorplan/types'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { buildAirconSystemPlan } from './airconSystem'
import type { PriceRules, TradeRates } from './renovationCost'
import { floorRateKind } from './renovationCost'

/** A single trade line in the allocation. */
export interface RenoTradeLine {
  /** Stable trade id (e.g. `hacking`, `tiling`). */
  id: string
  /** Friendly trade label. */
  label: string
  /** Quantity in `unit` (m² / lin.m / points / units / no.). */
  quantity: number
  unit: 'm²' | 'lin.m' | 'points' | 'units' | 'no.'
  /** Representative (blended) rate applied, SGD per unit. */
  rate: number
  /** Line subtotal, SGD. */
  subtotal: number
  /** Renovation stage this trade sits in (aligns with `renoTimeline` phases). */
  stage: string
}

/** An indicative SG cost band for context (clearly labelled, not a quote). */
export interface RenoBenchmark {
  label: string
  lo: number
  hi: number
}

export interface RenoAllocation {
  lines: RenoTradeLine[]
  /** Sum of every trade line (SGD), before contingency. */
  subtotal: number
  /** Contingency amount (SGD). */
  contingency: number
  /** Contingency percentage applied. */
  contingencyPct: number
  /** subtotal + contingency (SGD). */
  total: number
  /** The user's budget target, when set (SGD). */
  target?: number
  /** total − target (positive = over budget), when a target is set. */
  overUnder?: number
  /** Indicative SG reference bands (context only). */
  benchmarks: RenoBenchmark[]
}

/** Input to {@link buildRenovationAllocation}. Finish maps are room-id → finish
 *  id (the caller resolves the store finishes for the default flat vs. each
 *  custom room's own `floor`/`walls`, exactly as `openBoq` does). */
export interface RenoAllocatorInput {
  plan: FloorPlan
  items: FurnitureItem[]
  catalog: Record<string, FurnitureDef>
  floorFinishes: Record<string, string>
  wallFinishes: Record<string, string>
  rules: PriceRules
  /** As-built baseline for the hacking diff (absent = no hacking line). */
  baselinePlan?: FloorPlan
  /** North orientation (deg) for the aircon sizing (defaults to 0). */
  orientationDeg?: number
  /** The user's budget target (SGD); enables the over/under comparison. */
  budgetTarget?: number
}

/** Wet-work room categories: floors + walls are tiled + waterproofed. */
const WET_CATEGORIES = new Set(['bath', 'powder', 'kitchen'])

/** DefId patterns that price as built-in carpentry (linear-metre runs). */
const CARPENTRY_RE = /cabinet|wardrobe|kitchen-counter|kitchen-island|vanity/
/** DefId patterns for glass & aluminium panels (area-based). */
const GLASS_RE = /shower-screen|shower-enclosure|glass-partition|glass-screen|fluted-partition/
/** DefId patterns for sanitary / kitchen plumbing fixtures (count-based). */
const FIXTURE_RE =
  /toilet|\bwc\b|basin|bathroom-sink|kitchen-sink|\bsink\b|shower|bathtub|bidet|water-heater/

function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0
}

/** Item width (m) from live props, else the def footprint. */
function itemWidth(item: FurnitureItem, def: FurnitureDef): number {
  const w = item.props['width']
  if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w
  return def.defaultFootprint.w
}

/** Item height (m) from live props, else the def footprint height. */
function itemHeight(item: FurnitureItem, def: FurnitureDef): number {
  const h = item.props['height']
  if (typeof h === 'number' && Number.isFinite(h) && h > 0) return h
  return def.defaultFootprint.h > 0 ? def.defaultFootprint.h : 2
}

/** Total glazed area of a doorless plan's openings (m²) — width × (head − sill). */
function totalOpeningArea(plan: FloorPlan): number {
  const openings = Array.isArray(plan.openings) ? plan.openings : []
  let sum = 0
  for (const o of openings) {
    const w = Number.isFinite(o.width) ? o.width : 0
    const h = Number.isFinite(o.head) && Number.isFinite(o.sill) ? Math.max(0, o.head - o.sill) : 0
    sum += w * h
  }
  return sum
}

/**
 * Build the whole-renovation trade allocation from the live design. Pure; never
 * throws. Trades with a zero quantity are omitted (no NaN / zero-quantity noise).
 */
export function buildRenovationAllocation(input: RenoAllocatorInput): RenoAllocation {
  const { plan, items, catalog, floorFinishes, wallFinishes, rules } = input
  const trades: TradeRates = rules.trades
  const rooms: PlanRoom[] = Array.isArray(plan.rooms) ? plan.rooms : []
  const height =
    Number.isFinite(plan.ceilingHeight) && plan.ceilingHeight > 0 ? plan.ceilingHeight : 2.8

  // --- Room-derived areas ---------------------------------------------------
  let wetFloorArea = 0
  let wetWallArea = 0
  let dryWallArea = 0
  let ceilingArea = 0
  const dryFloorByFinish = new Map<string, number>()

  for (const room of rooms) {
    const cat = roomCategory(room)
    if (cat === 'balcony') continue // outdoor — finished separately
    const area = Math.max(0, planRoomArea(room))
    const h =
      Number.isFinite(room.ceilingHeight) && (room.ceilingHeight ?? 0) > 0
        ? (room.ceilingHeight as number)
        : height
    const wallArea = Math.max(0, planRoomPerimeter(room)) * h

    if (WET_CATEGORIES.has(cat)) {
      wetFloorArea += area
      wetWallArea += wallArea
    } else {
      dryWallArea += wallArea
      const finishId = floorFinishes[room.id]
      if (finishId) dryFloorByFinish.set(finishId, (dryFloorByFinish.get(finishId) ?? 0) + area)
    }

    if (room.ceiling?.style && room.ceiling.style !== 'flat') ceilingArea += area
  }
  void wallFinishes // wet-wall tiling uses the tile bucket, not the per-wall id

  // --- Item-derived quantities ---------------------------------------------
  let carpentryLm = 0
  let glassArea = 0
  let fixtureCount = 0
  for (const it of items) {
    const def = catalog[it.defId]
    if (!def) continue
    if (CARPENTRY_RE.test(it.defId)) {
      carpentryLm += itemWidth(it, def)
      continue
    }
    if (GLASS_RE.test(it.defId)) {
      glassArea += itemWidth(it, def) * itemHeight(it, def)
      continue
    }
    if (FIXTURE_RE.test(it.defId)) fixtureCount += 1
  }

  // --- Point / unit counts --------------------------------------------------
  const mepPoints =
    (Array.isArray(plan.electricalPoints) ? plan.electricalPoints.length : 0) +
    (Array.isArray(plan.plumbingPoints) ? plan.plumbingPoints.length : 0)
  // Aircon indoor-unit (FCU) count for the aircon trade line. Prefer the units
  // the user has ACTUALLY placed (`aircon-unit`, e.g. after "Plan aircon") — the
  // real quote basis; otherwise fall back to the system planner's proposal
  // (BSJ-2), which counts one FCU per served habitable room (identical to the
  // legacy per-room count, so no regression before any FCU is placed).
  const placedFcuCount = items.filter(
    (it) => it.defId === 'aircon-unit' && catalog[it.defId],
  ).length
  const airconUnits =
    placedFcuCount > 0
      ? placedFcuCount
      : buildAirconSystemPlan(plan, input.orientationDeg ?? 0).fcuCount

  // --- Hacking (baseline diff) ----------------------------------------------
  const hackedLm = input.baselinePlan ? diffWalls(input.baselinePlan, plan).hackedLengthM : 0

  // --- Assemble trade lines -------------------------------------------------
  const lines: RenoTradeLine[] = []
  const push = (
    id: string,
    label: string,
    quantity: number,
    unit: RenoTradeLine['unit'],
    subtotal: number,
    stage: string,
  ) => {
    if (!(quantity > 0) || !(subtotal > 0)) return
    lines.push({
      id,
      label,
      quantity: Math.round(quantity * 100) / 100,
      unit,
      rate: quantity > 0 ? Math.round((subtotal / quantity) * 100) / 100 : 0,
      subtotal: round(subtotal),
      stage,
    })
  }

  push(
    'hacking',
    'Hacking & demolition',
    hackedLm,
    'lin.m',
    hackedLm * trades.hackingPerM,
    'Protection & hacking',
  )

  const tilingArea = wetFloorArea + wetWallArea
  const tilingCost = wetFloorArea * rules.floor.tile + wetWallArea * rules.wall.tile
  push(
    'tiling',
    'Masonry & wet works (tiling)',
    tilingArea,
    'm²',
    tilingCost,
    'Tiling & waterproofing',
  )

  let dryFloorArea = 0
  let dryFloorCost = 0
  for (const [finishId, area] of dryFloorByFinish) {
    dryFloorArea += area
    dryFloorCost += area * rules.floor[floorRateKind(finishId)]
  }
  push(
    'flooring',
    'Flooring (dry areas)',
    dryFloorArea,
    'm²',
    dryFloorCost,
    'Tiling & waterproofing',
  )

  push(
    'carpentry',
    'Carpentry (built-ins)',
    carpentryLm,
    'lin.m',
    carpentryLm * rules.carpentryPerM,
    'Carpentry',
  )

  push(
    'ceiling',
    'Ceiling & partition works',
    ceilingArea,
    'm²',
    ceilingArea * trades.ceilingPerM2,
    'Electrical & ceiling',
  )

  const paintArea = Math.max(0, dryWallArea - totalOpeningArea(plan))
  push('painting', 'Painting', paintArea, 'm²', paintArea * rules.wall.paint, 'Painting')

  push(
    'me',
    'M&E (electrical & plumbing points)',
    mepPoints,
    'points',
    mepPoints * trades.mePerPoint,
    'Electrical & ceiling',
  )

  push(
    'aircon',
    'Air-conditioning (indoor units)',
    airconUnits,
    'units',
    airconUnits * trades.airconPerUnit,
    'Plumbing/electrical fit-out',
  )

  push(
    'glass',
    'Glass & aluminium',
    glassArea,
    'm²',
    glassArea * trades.glassPerM2,
    'Plumbing/electrical fit-out',
  )

  push(
    'fixtures',
    'Plumbing fixtures (install)',
    fixtureCount,
    'no.',
    fixtureCount * trades.plumbingFixtureEach,
    'Plumbing/electrical fit-out',
  )

  // --- Totals + contingency + benchmarks ------------------------------------
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
  const contingencyPct = trades.contingencyPct
  const contingency = round((subtotal * contingencyPct) / 100)
  const total = subtotal + contingency

  const out: RenoAllocation = {
    lines,
    subtotal,
    contingency,
    contingencyPct,
    total,
    benchmarks: [
      { label: '4-room BTO reno (indicative)', lo: 40000, hi: 60000 },
      { label: '4-room resale reno (indicative)', lo: 60000, hi: 90000 },
    ],
  }
  if (
    typeof input.budgetTarget === 'number' &&
    Number.isFinite(input.budgetTarget) &&
    input.budgetTarget > 0
  ) {
    out.target = input.budgetTarget
    out.overUnder = total - input.budgetTarget
  }
  return out
}
