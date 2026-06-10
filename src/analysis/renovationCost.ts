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

export interface RenoLine {
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
export function estimateRenovation(floors: FinishArea[], walls: FinishArea[]): RenovationEstimate {
  const floorLines: RenoLine[] = floors.map((f) => {
    const kind = floorRateKind(f.id)
    const rate = RENO_RATES.floor[kind]
    return { id: f.id, kind, area: f.area, rate, cost: round(f.area * rate) }
  })
  const wallLines: RenoLine[] = walls.map((w) => {
    const kind = wallRateKind(w.id)
    const rate = RENO_RATES.wall[kind]
    return { id: w.id, kind, area: w.area, rate, cost: round(w.area * rate) }
  })
  const bycost = (a: RenoLine, b: RenoLine) => b.cost - a.cost
  floorLines.sort(bycost)
  wallLines.sort(bycost)
  const subtotal = [...floorLines, ...wallLines].reduce((s, l) => s + l.cost, 0)
  return { floors: floorLines, walls: wallLines, subtotal }
}
