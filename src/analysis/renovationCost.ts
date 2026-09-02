/**
 * Rough renovation cost estimate — the *finishes* counterpart to the
 * furniture budget. Given the per-finish floor + wall areas the report already
 * computes (`floorAreaByFinish` / `wallAreaByFinish`), it applies representative
 * Singapore mid-market supply-and-install rates ($/m²) per finish category to
 * produce flooring + painting/wall line items and a subtotal.
 *
 * Pure + unit-testable. The rates are deliberately a single auditable table
 * (`RENO_RATES`) — they're an indicative order-of-magnitude only (they exclude
 * hacking/disposal, false ceilings, carpentry, M&E, and contractor margin), so
 * the UI must label the figure as an estimate.
 */

/** One finish's area (matches `reportData.FinishArea`, kept local to stay pure). */
export interface FinishArea {
  id: string
  area: number
}

/** Indicative SG supply+install rates (SGD per m²). */
export const RENO_RATES = {
  floor: { tile: 90, stone: 150, wood: 120, vinyl: 60, other: 85 },
  wall: { paint: 22, tile: 85, wallpaper: 45, other: 22 },
} as const

export type FloorRateKind = keyof typeof RENO_RATES.floor
export type WallRateKind = keyof typeof RENO_RATES.wall

/** Classify a floor finish id into a rate bucket by its keywords. */
export function floorRateKind(id: string): FloorRateKind {
  const s = id.toLowerCase()
  if (/marble|granite|stone|terrazzo|quartz/.test(s)) return 'stone'
  if (/vinyl|laminate|lino/.test(s)) return 'vinyl'
  if (/tile|porcelain|ceramic|cement/.test(s)) return 'tile'
  if (/wood|parquet|oak|walnut|teak|ash|herringbone|timber/.test(s)) return 'wood'
  return 'other'
}

/** Classify a wall finish id into a rate bucket by its keywords. */
export function wallRateKind(id: string): WallRateKind {
  const s = id.toLowerCase()
  if (/tile|porcelain|ceramic|backsplash/.test(s)) return 'tile'
  if (/wallpaper|paper|mural/.test(s)) return 'wallpaper'
  if (/paint|plaster|limewash/.test(s)) return 'paint'
  return 'other'
}

// ---------------------------------------------------------------------------
// Price-rule library — user-configurable overrides for the rate table above.
//
// `RENO_RATES` + the built-in carpentry rate are the *defaults*; a contractor
// can override any per-kind $/m² rate (and the carpentry $/lin.m) so the quote
// and the renovation estimate price against their own rate card. Pure and
// serialisable — travels with the design (save schema) like the quote template.

/** Built-in carpentry rate (SGD per linear metre) for cabinet/wardrobe runs. */
const DEFAULT_CARPENTRY_RATE = 320

/**
 * Per-trade rates for the whole-renovation budget allocator (BSJ-1). These cover
 * the trades the finishes-only `estimateRenovation` deliberately excludes
 * (hacking, ceiling, M&E, aircon, glass, plumbing fixtures) so the allocator can
 * reuse ONE rate card end-to-end. The tiling + painting + flooring trades reuse
 * the existing `floor`/`wall` finish buckets above (single source of truth), so
 * they intentionally have no entry here.
 *
 * Indicative SG mid-market 2025-26 rates (9creation / Qanvast / RCS).
 */
type TradeRateKey =
  /** Demolition / hacking, SGD per linear metre of demolished wall. */
  | 'hackingPerM'
  | 'partitionPerM2'
  /** False ceiling / partition ceiling works, SGD per m². */
  | 'ceilingPerM2'
  /** M&E first/final fix, SGD per electrical or plumbing point. */
  | 'mePerPoint'
  /** Aircon install allowance, SGD per indoor FCU (incl. share of piping/condenser). */
  | 'airconPerUnit'
  /** Refrigerant-trunking install allowance, SGD per linear metre of MODELED
   *  route (BSJ-2 follow-up) — piping/insulation/bracketing labour, additive
   *  to `airconPerUnit`'s flat per-FCU share. */
  | 'airconTrunkingPerM'
  /** Glass & aluminium (shower screens / partitions / grilles), SGD per m². */
  | 'glassPerM2'
  /** Sanitary / plumbing fixture install, SGD each. */
  | 'plumbingFixtureEach'
  /** Waterproofing membrane (wet-area floor + wall upturn, BSJ-7), SGD per m². */
  | 'waterproofingPerM2'
  /** Contingency, percent of the trade subtotal (0–100). */
  | 'contingencyPct'

/** A `Record` (not an interface) so it stays assignable to the lenient
 *  `Record<string, number>` save schema, exactly like the `floor`/`wall` maps. */
export type TradeRates = Record<TradeRateKey, number>

/** Factory-default per-trade rates. */
const DEFAULT_TRADE_RATES: TradeRates = {
  hackingPerM: 55,
  /**
   * NEW partition walls, SGD per m² of wall FACE.
   *
   * Added walls were computed (`WallDiff.addedLengthM`), printed on the report
   * and the demolition sheet, and **never priced** — so a design that added
   * partitions was under-budgeted while displaying the added length beside a
   * total that ignored it. Building costs more than demolishing, so the
   * omission ran the wrong way.
   *
   * 100 is the middle of the published single-layer drywall band ($80-130/m²
   * installed in 2026, "inclusive of metal stud frame, boards, taping,
   * plastering, and one coat of paint"). Drywall is the default because it is
   * the cheaper, commoner and permit-free option: "non-structural partitions —
   * lightweight gypsum, glass, or timber ... generally do not require an HDB
   * renovation permit". A brick or concrete partition runs $100-200/m² and a
   * double-layer acoustic one $130-200/m², both of which a user can dial in on
   * the rate card.
   *
   * Priced per m² rather than per linear metre precisely so a HALF-HEIGHT wall
   * (`PlanWall.topHeight`) costs less than a full-height one — which per-metre
   * pricing could not express.
   *
   * Sources: rkec.sg "Drywall & Partition Wall Installation in Singapore
   * (2026)"; fortified.com.sg "Partition Wall Cost 2026"; fixitpapa.sg "HDB
   * Partition Wall Rules Singapore".
   */
  partitionPerM2: 100,
  ceilingPerM2: 32,
  mePerPoint: 120,
  airconPerUnit: 1800,
  // SG installed-trunking allowance — indicative mid-market rate covering
  // copper piping + insulation + bracketing labour per linear metre run
  // (9creation/Qanvast-style aircon add-on quotes, 2025-26).
  airconTrunkingPerM: 20,
  glassPerM2: 240,
  plumbingFixtureEach: 150,
  waterproofingPerM2: 35,
  contingencyPct: 10,
}

/** A complete, user-overridable rate card driving the quote + renovation estimate. */
export interface PriceRules {
  /** $/m² per floor-finish bucket. */
  floor: Record<FloorRateKind, number>
  /** $/m² per wall-finish bucket. */
  wall: Record<WallRateKind, number>
  /** Carpentry $/linear metre (cabinets / wardrobes / counters). */
  carpentryPerM: number
  /** Per-trade rates for the whole-reno budget allocator (BSJ-1). Additive — the
   *  BOQ + `estimateRenovation` never read this, so their output is unchanged. */
  trades: TradeRates
}

/** Factory defaults — reproduce the built-in rate table exactly. */
export const DEFAULT_PRICE_RULES: PriceRules = {
  floor: { ...RENO_RATES.floor },
  wall: { ...RENO_RATES.wall },
  carpentryPerM: DEFAULT_CARPENTRY_RATE,
  trades: { ...DEFAULT_TRADE_RATES },
}

/** Clamp a single rate to a finite, non-negative number (fallback to the default). */
function safeRate(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
}

/** Clamp a percentage to a finite [0, 100] number (fallback to the default). */
function safePct(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : fallback
}

/** A loosely-typed partial rate card (each bucket independently optional) —
 *  the shape a deserialised save or a single-field UI edit produces. */
export interface PartialPriceRules {
  floor?: Partial<Record<FloorRateKind, number>>
  wall?: Partial<Record<WallRateKind, number>>
  carpentryPerM?: number
  trades?: Partial<TradeRates>
}

/** Merge a partial (e.g. deserialised) rate card onto the defaults, sanitising
 *  every field so a corrupt save can never inject a negative / NaN rate. */
export function mergePriceRules(partial?: PartialPriceRules | null): PriceRules {
  const d = DEFAULT_PRICE_RULES
  const floor = {} as Record<FloorRateKind, number>
  for (const k of Object.keys(d.floor) as FloorRateKind[]) {
    floor[k] = safeRate(partial?.floor?.[k], d.floor[k])
  }
  const wall = {} as Record<WallRateKind, number>
  for (const k of Object.keys(d.wall) as WallRateKind[]) {
    wall[k] = safeRate(partial?.wall?.[k], d.wall[k])
  }
  const trades = {} as TradeRates
  for (const k of Object.keys(DEFAULT_TRADE_RATES) as (keyof TradeRates)[]) {
    trades[k] =
      k === 'contingencyPct'
        ? safePct(partial?.trades?.[k], DEFAULT_TRADE_RATES[k])
        : safeRate(partial?.trades?.[k], DEFAULT_TRADE_RATES[k])
  }
  return { floor, wall, carpentryPerM: safeRate(partial?.carpentryPerM, d.carpentryPerM), trades }
}

/** True when any rate differs from the factory default (decides save-schema persistence). */
export function isNonDefaultPriceRules(r: PriceRules): boolean {
  const d = DEFAULT_PRICE_RULES
  if (r.carpentryPerM !== d.carpentryPerM) return true
  for (const k of Object.keys(d.floor) as FloorRateKind[])
    if (r.floor[k] !== d.floor[k]) return true
  for (const k of Object.keys(d.wall) as WallRateKind[]) if (r.wall[k] !== d.wall[k]) return true
  const t = r.trades ?? DEFAULT_TRADE_RATES
  for (const k of Object.keys(DEFAULT_TRADE_RATES) as (keyof TradeRates)[])
    if (t[k] !== DEFAULT_TRADE_RATES[k]) return true
  return false
}

/** Resolve the $/m² rate for a floor finish id under a rate card. */
export function floorRateFor(rules: PriceRules, id: string): number {
  return rules.floor[floorRateKind(id)]
}

/** Resolve the $/m² rate for a wall finish id under a rate card. */
export function wallRateFor(rules: PriceRules, id: string): number {
  return rules.wall[wallRateKind(id)]
}

interface RenoLine {
  /** Finish id (caller maps to a friendly name). */
  id: string
  /** Rate bucket used. */
  kind: string
  area: number
  rate: number
  cost: number
}

export interface RenovationEstimate {
  floors: RenoLine[]
  walls: RenoLine[]
  /** Sum of every line (SGD). */
  subtotal: number
}

function round(n: number): number {
  return Math.round(n)
}

/**
 * Build the renovation estimate from per-finish floor + wall areas. Lines are
 * sorted by descending cost so the biggest spend reads first.
 */
export function estimateRenovation(
  floors: FinishArea[],
  walls: FinishArea[],
  rules: PriceRules = DEFAULT_PRICE_RULES,
): RenovationEstimate {
  const floorLines: RenoLine[] = floors.map((f) => {
    const kind = floorRateKind(f.id)
    const rate = rules.floor[kind]
    return { id: f.id, kind, area: f.area, rate, cost: round(f.area * rate) }
  })
  const wallLines: RenoLine[] = walls.map((w) => {
    const kind = wallRateKind(w.id)
    const rate = rules.wall[kind]
    return { id: w.id, kind, area: w.area, rate, cost: round(w.area * rate) }
  })
  const bycost = (a: RenoLine, b: RenoLine) => b.cost - a.cost
  floorLines.sort(bycost)
  wallLines.sort(bycost)
  const subtotal = [...floorLines, ...wallLines].reduce((s, l) => s + l.cost, 0)
  return { floors: floorLines, walls: wallLines, subtotal }
}
