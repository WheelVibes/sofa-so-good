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
  // A standard bathtub holds ~230 L. 230 kg of water + ~30 kg acrylic tub +
  // a ~70 kg bather = ~330 kg. Corrected from 300 in v0.31.8.22: the old
  // comment stated the same three components and then rounded DOWN, which is
  // the wrong direction for this module's stated conservative policy. It does
  // not change any verdict — over its 1.20 m² footprint that is 275 vs 250
  // kg/m², both far past the 150 limit — but the arithmetic should be right.
  bathtub: 330,
  // A large glass aquarium: water + rock + glass + stand. The def is
  // 0.90 × 0.42 m and 1.12 m tall including its stand, so the tank itself is
  // ~170 L → ~220 kg realistically; 320 kg is the conservative end, matching
  // published totals for a 200 L tank (~275 kg all-in).
  aquarium: 320,
  // "Aquarium stand + tank" — a tank INCLUDING its stand, so the same figure.
  // Placing an `aquarium` on top of one would double-count to 640 kg; unlikely
  // (the stand def already has a tank) and left alone rather than special-cased.
  'aquarium-stand': 320,
  // Upright piano: published ranges put uprights at 227–363 kg, so 300 is
  // mid-range rather than conservative — deliberate, because an upright is the
  // realistic HDB case and the density check flags it comfortably anyway
  // (0.87 m² footprint → 345 kg/m²).
  piano: 300,
  // **DEAD ENTRIES, kept deliberately (v0.31.8.22).** `fish-tank`,
  // `upright-piano`, `grand-piano` and `safe` are not defs in the catalogue —
  // 4 of the 8 keys this table had, including its heaviest figure (a 420 kg
  // grand piano applying to nothing). Kept because each is a plausible future
  // def and the figures are researched (grand pianos run 227–590 kg; a home
  // safe 50–500 kg), and pinned by a test that records WHICH keys are live, so
  // adding one of these defs surfaces the pre-set weight instead of it quietly
  // starting to apply.
  'fish-tank': 320,
  'upright-piano': 300,
  'grand-piano': 420,
  safe: 250,
}

/** Material tokens that mark a stone / masonry top (heavy). */
const STONE_MATERIALS = new Set(['marble', 'stone', 'granite', 'terrazzo', 'quartz', 'concrete'])
/** Estimated weight of a stone/marble-topped table (kg) — a 20–30 mm slab top. */
const STONE_TABLE_KG = 160
/**
 * Def ids that are tables (a stone top makes them heavy).
 *
 * **Audited v0.31.8.21.** This matches 16 defs, including `table-lamp`,
 * `desk-plant` and `tabletop-decor` — a lamp, a plant and a decor object. Those
 * are LATENT rather than live: none of them declares a stone-capable finish
 * option, so `hasStoneMaterial` cannot be satisfied from a builtin def's own
 * enum and the 160 kg branch never fires for them. Checked before claiming
 * otherwise.
 *
 * `CATEGORY_EXCLUDE` closes them anyway, because "latent" only holds until
 * someone adds a marble base to a table lamp, and because an imported def can
 * carry an arbitrary material string. It also removes the one REACHABLE false
 * positive found: `changing-table` (category `kids`) declares
 * `finish=concrete`, so a baby changing table was being estimated at 160 kg.
 */
const TABLE_RE = /table|desk|island|console/
/** Categories that are never a stone-topped SURFACE, whatever the id says. */
const CATEGORY_EXCLUDE: ReadonlySet<string> = new Set(['lighting', 'decor', 'kids', 'pets'])
/** Def ids that are open shelving / bookcases (loaded with books ≈ heavy). */
const BOOKCASE_RE = /bookshelf|bookcase|shelf|shelving/
/** Estimated loaded weight of a full-height bookcase packed with books (kg). */
const LOADED_BOOKCASE_KG = 200
/**
 * Def ids that model a raised floor platform.
 *
 * **Matches NOTHING in the catalogue (measured v0.31.8.21)** — there is no
 * platform/dais/riser/podium/tatami def, so this branch and `RAISE_KEYS` are
 * unreachable today. Kept rather than deleted because the HDB raise limit it
 * guards is real and a platform-bed or tatami dais is a plausible future def;
 * `floorLoading.test.ts` pins that it currently matches nothing, so the day one
 * is added the test says so instead of the branch quietly starting to fire.
 */
const PLATFORM_RE = /platform|dais|riser|podium|tatami/

/** Prop keys a raised-platform height might be stored under (metres). */
const RAISE_KEYS = ['raise', 'height', 'rise', 'platformHeight', 'thickness']

/** One heavy item, with its estimated load density. */
interface FloorLoadItem {
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
interface RaisedPlatform {
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
export function estimateItemWeightKg(
  defId: string,
  props: ParamProps | undefined,
  /** The def's category, when the caller has it — lets the stone-table branch
   *  reject a lamp/plant/decor/kids piece whose ID merely contains "table". */
  category?: string,
): number {
  const id = defId.toLowerCase()
  // **ORDER MATTERS, and it is not obvious.** The explicit heavy-item table must
  // be consulted BEFORE `CATEGORY_EXCLUDE`, because two of its entries sit in
  // excluded categories: `aquarium` is `decor` and `aquarium-stand` is `pets`.
  // Reversing these two lines would silently return 0 for a 320 kg aquarium —
  // the exclusion exists only to stop an ID regex catching a lamp, never to
  // override a figure someone put in the table on purpose.
  // `floorLoading.test.ts` pins this ordering.
  if (HEAVY_KG_BY_DEF[id] != null) return HEAVY_KG_BY_DEF[id]
  if (category != null && CATEGORY_EXCLUDE.has(category)) return 0
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
    // A wall/ceiling fixture does not load the SLAB, and a rug has no weight
    // worth counting (v0.31.8.21). Without this, `BOOKCASE_RE` matched
    // `wall-shelf` and `cat-wall-shelf` — both `mounted: true` — and
    // `estimateItemWeightKg` returned `LOADED_BOOKCASE_KG` (200 kg)
    // unconditionally for them, so a pair of wall shelves added 400 kg of
    // floor loading that physically hangs off the wall. Every other check in
    // the app already exempts mounted/noClip items; this one did not.
    if (def.mounted || def.noClip) continue
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
    const weight = estimateItemWeightKg(def.id, item.props, def.category)
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
