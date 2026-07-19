/**
 * Floor-loading / raised-platform advisory (UX research round 4 R4-5).
 *
 * HDB floor slabs are designed for a 150 kg/m² imposed (live) load. A cluster of
 * a few heavy items — a filled bathtub, a large aquarium, a stone-topped table, a
 * piano, a fully-loaded bookcase — can plausibly exceed that locally, and a
 * concrete floor raise over 50 mm implies structural loading that needs an HDB
 * permit (the compliant alternative is a lightweight timber-joist platform). This
 * module flags those suspects from a small static weight table keyed on def id /
 * category, computing an approximate load density (weight ÷ footprint area) and
 * comparing it against the guideline.
 *
 * The numbers are deliberately conservative rule-of-thumb ESTIMATES for an
 * advisory cue, not an engineering calculation — the copy says so, and always
 * recommends confirming with a PE / contractor for anything marginal.
 *
 * Pure logic only (no store, no React, no three) → deterministic + unit-testable.
 * Surfaced as an advisory group in the Checks panel (`ui/ClearancePanel.tsx`),
 * gated by the `floorLoading` pro flag.
 *
 * Refs (rules as of 2026):
 *  - homeanddecor.com.sg/design/renovation-guidelines-hdb-singapore/
 *  - floorrich.com/an-easy-to-understand-guide-to-hdb-flooring-guidelines/
 */

import type { FurnitureDef, FurnitureItem, ParamProps } from '../furniture/types'

/** The HDB imposed-load guideline for a residential floor slab (kg/m²). */
export const SLAB_LOAD_LIMIT = 150
/** A concrete floor raise beyond this depth (m, = 50 mm) implies structural
 *  loading requiring a permit — timber-joist is the compliant alternative. */
export const CONCRETE_RAISE_LIMIT_M = 0.05

/**
 * Static estimated weight (kg) for the heavy "suspect" def ids — filled /
 * loaded, i.e. the realistic in-use weight, not the empty product. Any def not
 * listed (and not caught by the category / material rules below) contributes no
 * weight and is never flagged.
 */
const HEAVY_KG_BY_DEF: Record<string, number> = {
  // A standard bathtub holds ~230 L; with the tub + a bather ≈ 300 kg.
  bathtub: 300,
  // A large glass aquarium: water + rock + glass + stand, ~250–350 kg.
  aquarium: 320,
  'aquarium-stand': 320,
  'fish-tank': 320,
  // Upright / grand piano.
  piano: 300,
  'upright-piano': 300,
  'grand-piano': 420,
  // A safe / gun cabinet.
  safe: 250,
}

/** Material tokens that mark a stone / masonry top (heavy). */
const STONE_MATERIALS = new Set(['marble', 'stone', 'granite', 'terrazzo', 'quartz', 'concrete'])
/** Estimated weight of a stone/marble-topped table (kg) — a 20–30 mm slab top. */
const STONE_TABLE_KG = 160
/** Def ids that are tables (a stone top makes them heavy). */
const TABLE_RE = /table|desk|island|console/
/** Def ids that are open shelving / bookcases (loaded with books ≈ heavy). */
const BOOKCASE_RE = /bookshelf|bookcase|shelf|shelving/
/** Estimated loaded weight of a full-height bookcase packed with books (kg). */
const LOADED_BOOKCASE_KG = 200
/** Def ids that model a raised floor platform. */
const PLATFORM_RE = /platform|dais|riser|podium|tatami/

/** Prop keys a raised-platform height might be stored under (metres). */
const RAISE_KEYS = ['raise', 'height', 'rise', 'platformHeight', 'thickness']

/** One heavy item, with its estimated load density. */
export interface FloorLoadItem {
  itemId: string
  defId: string
  name: string
  estWeightKg: number
  footprintM2: number
  densityKgM2: number
  /** True when the density exceeds the slab guideline. */
  exceeds: boolean
}

/** One modelled raised platform that implies concrete loading. */
export interface RaisedPlatform {
  itemId: string
  name: string
  raiseMm: number
}

export interface FloorLoadingReport {
  /** Heavy items exceeding the slab guideline (density > limit). */
  exceeding: FloorLoadItem[]
  /** Heavy items present but within the guideline (context, not a warning). */
  watch: FloorLoadItem[]
  /** Raised platforms deeper than the 50 mm concrete-raise threshold. */
  platforms: RaisedPlatform[]
  /** True when there is anything to warn about (an exceedance or a platform). */
  hasConcern: boolean
}

/** Read a numeric prop, or `undefined` when absent / non-numeric. */
function numProp(props: ParamProps | undefined, key: string): number | undefined {
  const v = props?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** Uniform + per-axis scale multiplier for a footprint axis. */
function scaleFor(props: ParamProps | undefined, axis: 'x' | 'z'): number {
  const base = numProp(props, 'scale') ?? 1
  const per = numProp(props, axis === 'x' ? 'scaleX' : 'scaleZ') ?? 1
  return base * per
}

/** Footprint area (m²) from the def's default footprint scaled by the item's
 *  scale props. Falls back to a small positive area so density never divides by
 *  zero. */
function footprintArea(def: FurnitureDef, item: FurnitureItem): number {
  const fp = def.defaultFootprint
  const w = (fp?.w ?? 0.5) * scaleFor(item.props, 'x')
  const d = (fp?.d ?? 0.5) * scaleFor(item.props, 'z')
  return Math.max(0.05, w * d)
}

/** True when any of the item's props carries a stone/masonry material token. */
function hasStoneMaterial(props: ParamProps | undefined): boolean {
  if (!props) return false
  for (const v of Object.values(props)) {
    if (typeof v === 'string' && STONE_MATERIALS.has(v)) return true
  }
  return false
}

/** Estimate an item's in-use weight (kg), or 0 when it is not a heavy suspect. */
export function estimateItemWeightKg(defId: string, props: ParamProps | undefined): number {
  const id = defId.toLowerCase()
  if (HEAVY_KG_BY_DEF[id] != null) return HEAVY_KG_BY_DEF[id]
  if (TABLE_RE.test(id) && hasStoneMaterial(props)) return STONE_TABLE_KG
  if (BOOKCASE_RE.test(id)) return LOADED_BOOKCASE_KG
  return 0
}

/**
 * Build the floor-loading advisory for the placed items. Pure + deterministic;
 * never throws on a partial input.
 */
export function buildFloorLoadingReport(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
): FloorLoadingReport {
  const exceeding: FloorLoadItem[] = []
  const watch: FloorLoadItem[] = []
  const platforms: RaisedPlatform[] = []

  for (const item of Array.isArray(items) ? items : []) {
    const def = catalog?.[item?.defId]
    if (!def) continue
    const id = def.id.toLowerCase()

    // Raised-platform check.
    if (PLATFORM_RE.test(id)) {
      let raise = 0
      for (const k of RAISE_KEYS) {
        const v = numProp(item.props, k)
        if (v != null) {
          raise = Math.max(raise, v)
        }
      }
      if (raise > CONCRETE_RAISE_LIMIT_M) {
        platforms.push({ itemId: item.id, name: def.name, raiseMm: Math.round(raise * 1000) })
      }
    }

    // Heavy-item density check.
    const weight = estimateItemWeightKg(def.id, item.props)
    if (weight <= 0) continue
    const area = footprintArea(def, item)
    const density = weight / area
    const row: FloorLoadItem = {
      itemId: item.id,
      defId: def.id,
      name: def.name,
      estWeightKg: weight,
      footprintM2: Math.round(area * 100) / 100,
      densityKgM2: Math.round(density),
      exceeds: density > SLAB_LOAD_LIMIT,
    }
    if (row.exceeds) exceeding.push(row)
    else watch.push(row)
  }

  return {
    exceeding,
    watch,
    platforms,
    hasConcern: exceeding.length > 0 || platforms.length > 0,
  }
}
