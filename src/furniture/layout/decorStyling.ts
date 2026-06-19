/**
 * Decor styling pass for auto-furnished rooms.
 *
 * Given the arranged items for a set of plan rooms, returns a small, balanced
 * set of decor prop placements sitting ON appropriate host surfaces. Props are
 * `noClip` so they never create collision conflicts with floor furniture.
 *
 * Host-surface matching strategy:
 *   sofa / chaise / sectional   → throw-cushion, throw-blanket
 *   coffee-table                → fruit-bowl, magazine-stack, candle-cluster
 *   dining-table                → candle-cluster, fruit-bowl
 *   bed                         → throw-cushion, throw-blanket
 *   nightstand                  → desk-plant, candle-cluster
 *   desk                        → desk-plant, book-stack
 *   console-table / sideboard   → book-stack, small-sculpture, photo-frame-cluster
 *   bookshelf / cube-shelf      → book-stack, small-sculpture, desk-plant
 *
 * Density (RD408-001): each host gets a per-surface budget derived from its
 * footprint AREA and a conservative per-type ceiling, so a long sideboard or a
 * 3-seat sofa reads richer than a tiny nightstand while staying tasteful. A
 * per-room total cap (ROOM_DECOR_CAP) bounds density for perf.
 *
 * Position (RD408-002): props are spread across the host's real footprint
 * (rotation-aware — the spread aligns to the host's yaw) with a small seeded
 * jitter, so multiple props on one surface don't overlap and read naturally.
 * Props stay inset from the footprint edges so they never spill off the host.
 *
 * Rotation (RD408-003): each prop gets a small seeded yaw jitter around the
 * host's facing so nothing is dead-square / obviously auto-placed.
 *
 * Variety (RD-408): repeated soft goods (cushions/blankets) and book stacks draw
 * a seeded colour from a curated palette (offset by slot) so a sofa's cushions or
 * a shelf's books aren't identical clones — the clearest auto-placed tell.
 *
 * Pure + deterministic (no store, no GPU) → unit-testable. Seedable via the
 * optional `seed` parameter so results are stable in tests.
 */

import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { pointInRoom } from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem, ParamProps } from '../types'
import { defaultParamProps } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum host surface footprint (m²) before we consider it too small to dress. */
const MIN_HOST_AREA = 0.12

/** Footprint area (m²) that "buys" one prop before the per-type ceiling clamps. */
const AREA_PER_PROP = 0.45

/** Per-room total decor cap (clutter + perf guard). Lowest-priority trimmed. */
const ROOM_DECOR_CAP = 10

/** Fraction of a host dimension usable for spreading props (inset from edges). */
const SPREAD_SPAN = 0.66

/** Seeded position jitter (m) applied on each local axis after slot layout. */
const POS_JITTER = 0.04

/** Default rotation jitter half-range (radians, ≈ ±14°). */
const ROT_JITTER = 0.5

/** Per-prop rotation jitter half-range (radians). Soft goods tilt more freely
 *  than precise objects (frames/sculptures sit squarer). */
const ROT_JITTER_BY_PROP: Record<string, number> = {
  'throw-cushion': 0.7, // ≈ ±20°
  'throw-blanket': 0.7,
  'photo-frame-cluster': 0.28, // ≈ ±8°
  'small-sculpture': 0.28,
  'book-stack': 0.4,
}

/** Per-host-type ceiling on prop count, regardless of how large the surface is.
 *  Conservative — tasteful beats dense. */
const HOST_MAX: Record<string, number> = {
  'sofa-3seat': 4,
  'sofa-2seat': 3,
  'sofa-lshape': 4,
  armchair: 1,
  'chaise-lounge': 2,
  'bed-queen': 4,
  'bed-king': 4,
  'bed-double': 3,
  'bed-single': 2,
  'coffee-table': 3,
  'dining-table-4': 3,
  'side-table': 1,
  nightstand: 2,
  desk: 2,
  'console-table': 3,
  sideboard: 3,
  bookshelf: 3,
  'cube-shelf': 3,
  dresser: 2,
}

/** Curated, tasteful colour palettes for repeated soft-good / book props, so
 *  multiple cushions on a sofa or books on a shelf vary instead of reading as
 *  identical clones — the clearest "auto-placed" tell (RD-408 prop variety).
 *  Keyed by prop id → the colour param to vary + its palette. */
interface PropVariety {
  /** Colour param to vary + its palette. */
  key: string
  palette: readonly string[]
  /** Optional enum params to vary, each as a weighted option list (repeat a value
   *  to bias toward it — e.g. mostly 'square', occasionally 'rect'). */
  enums?: Record<string, readonly string[]>
}
const VARIETY: Record<string, PropVariety> = {
  'throw-cushion': {
    key: 'color',
    palette: ['#b08068', '#7a8a7c', '#9c6b5a', '#5f6b78', '#c2a878', '#86736a', '#6b8a86'],
    // Mostly square + plain, with the occasional rectangular / striped cushion so
    // a sofa's scatter reads as a real mix, not stamped clones.
    enums: { shape: ['square', 'square', 'rect'], pattern: ['plain', 'plain', 'stripe'] },
  },
  'throw-blanket': {
    key: 'color',
    palette: ['#c4b49a', '#9aa6a0', '#b89a86', '#8a9aa6', '#cabfa6'],
  },
  'book-stack': {
    key: 'spineColor',
    palette: ['#7a4028', '#3b5a6b', '#5a6b3b', '#7d3b3b', '#b08a3e', '#3b6f6b', '#6b4a7d'],
  },
}

// ── Host-surface definitions ─────────────────────────────────────────────────

/** Decor prop ids that may be placed on a given host. Priority order: the first
 *  props listed are preferred; we cycle through them up to the surface budget. */
const HOST_PROPS: Record<string, readonly string[]> = {
  // Seating (sofa / armchair)
  'sofa-3seat': ['throw-cushion', 'throw-blanket'],
  'sofa-2seat': ['throw-cushion', 'throw-blanket'],
  'sofa-lshape': ['throw-cushion', 'throw-blanket'],
  armchair: ['throw-cushion'],
  'chaise-lounge': ['throw-cushion', 'throw-blanket'],
  // Beds
  'bed-queen': ['throw-cushion', 'throw-blanket'],
  'bed-king': ['throw-cushion', 'throw-blanket'],
  'bed-double': ['throw-cushion', 'throw-blanket'],
  'bed-single': ['throw-cushion'],
  // Low / occasional tables
  'coffee-table': ['fruit-bowl', 'magazine-stack', 'candle-cluster'],
  'dining-table-4': ['candle-cluster', 'fruit-bowl'],
  'side-table': ['candle-cluster', 'desk-plant'],
  // Nightstands / bedside
  nightstand: ['desk-plant', 'candle-cluster'],
  // Work surfaces
  desk: ['desk-plant', 'book-stack'],
  // Storage tops (console, sideboard, bookshelf, cube-shelf)
  'console-table': ['photo-frame-cluster', 'small-sculpture', 'book-stack'],
  sideboard: ['photo-frame-cluster', 'book-stack', 'candle-cluster'],
  bookshelf: ['book-stack', 'small-sculpture', 'desk-plant'],
  'cube-shelf': ['book-stack', 'small-sculpture'],
  dresser: ['photo-frame-cluster', 'desk-plant'],
}

/** Surface-top height in metres for common hosts (derived from defaultFootprint.h).
 *  Used when we can't read the host's defaultFootprint from the catalog. */
const FALLBACK_TOP: Record<string, number> = {
  'sofa-3seat': 0.52,
  'sofa-2seat': 0.52,
  'sofa-lshape': 0.52,
  armchair: 0.52,
  'chaise-lounge': 0.52,
  'bed-queen': 0.6,
  'bed-king': 0.6,
  'bed-double': 0.56,
  'bed-single': 0.52,
  'coffee-table': 0.42,
  'dining-table-4': 0.74,
  'side-table': 0.62,
  nightstand: 0.52,
  desk: 0.74,
  'console-table': 0.82,
  sideboard: 0.85,
  bookshelf: 1.4,
  'cube-shelf': 0.84,
  dresser: 0.82,
}

/** Fallback host footprint (w × d, metres) when the catalog def is unavailable. */
const FALLBACK_FOOTPRINT: Record<string, { w: number; d: number }> = {
  'sofa-3seat': { w: 2.1, d: 0.9 },
  'sofa-2seat': { w: 1.6, d: 0.9 },
  'sofa-lshape': { w: 2.4, d: 1.6 },
  armchair: { w: 0.8, d: 0.85 },
  'chaise-lounge': { w: 1.6, d: 0.7 },
  'bed-queen': { w: 1.6, d: 2.03 },
  'bed-king': { w: 1.82, d: 2.03 },
  'bed-double': { w: 1.4, d: 2.0 },
  'bed-single': { w: 0.9, d: 1.9 },
  'coffee-table': { w: 1.1, d: 0.55 },
  'dining-table-4': { w: 1.5, d: 0.9 },
  'side-table': { w: 0.45, d: 0.45 },
  nightstand: { w: 0.45, d: 0.4 },
  desk: { w: 1.2, d: 0.6 },
  'console-table': { w: 1.2, d: 0.35 },
  sideboard: { w: 1.6, d: 0.42 },
  bookshelf: { w: 0.8, d: 0.3 },
  'cube-shelf': { w: 0.8, d: 0.35 },
  dresser: { w: 1.0, d: 0.45 },
}

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed >>> 0
  return (): number => {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

// ── Core logic ────────────────────────────────────────────────────────────────

/** Resolve the top-surface height (metres) of a placed item. */
function surfaceTopHeight(item: FurnitureItem, def: FurnitureDef | undefined): number {
  if (def) {
    const h = def.defaultFootprint.h
    const base = item.elevation ?? 0
    return base + h
  }
  return FALLBACK_TOP[item.defId] ?? 0.5
}

/** Read a host's plan footprint (w × d, metres) from the catalog or fallback. */
function hostFootprint(
  item: FurnitureItem,
  def: FurnitureDef | undefined,
): { w: number; d: number } {
  if (def) return { w: def.defaultFootprint.w, d: def.defaultFootprint.d }
  return FALLBACK_FOOTPRINT[item.defId] ?? { w: 0.5, d: 0.5 }
}

/** True when `defId` is a known host surface we style onto. */
function isHost(defId: string): boolean {
  return defId in HOST_PROPS
}

/** Per-surface prop budget (RD408-001): scale with footprint area, clamp to the
 *  host-type ceiling, always at least 1 for a dressable surface. */
function surfaceBudget(item: FurnitureItem, area: number): number {
  const ceiling = HOST_MAX[item.defId] ?? 3
  const byArea = Math.round(area / AREA_PER_PROP)
  return Math.max(1, Math.min(byArea, ceiling))
}

/**
 * Lay out `count` prop positions across the host's footprint (RD408-002).
 *
 * Slots are distributed along the host's local long axis, inset from the edges
 * by SPREAD_SPAN, then offset onto a near/far row on the short axis and given a
 * small seeded jitter. The local (du, dv) offset is rotated by the host's yaw
 * into world X/Z so the spread aligns to a rotated, wall-flushed host. Jitter is
 * clamped so props always stay within the host footprint (never spill off edges).
 */
function slotPositions(
  host: FurnitureItem,
  footprint: { w: number; d: number },
  count: number,
  rand: () => number,
): [number, number][] {
  const { w, d } = footprint
  // Local axes: u = long (w), v = short (d). Choose the longer dim as the run.
  const longAlongW = w >= d
  const longDim = longAlongW ? w : d
  const shortDim = longAlongW ? d : w
  const usableLong = longDim * SPREAD_SPAN
  const usableShort = shortDim * SPREAD_SPAN
  // Max half-extent a prop centre may sit at without leaving the footprint.
  const halfLong = Math.max(0, longDim / 2 - 0.02)
  const halfShort = Math.max(0, shortDim / 2 - 0.02)

  const cos = Math.cos(host.rotation)
  const sin = Math.sin(host.rotation)
  const out: [number, number][] = []

  for (let i = 0; i < count; i++) {
    // Even slot along the long axis, centred (−usableLong/2 … +usableLong/2).
    const t = count === 1 ? 0.5 : i / (count - 1)
    let local = (t - 0.5) * usableLong
    // Alternate near/far row on the short axis so props don't form one line.
    let lateral = count > 1 ? ((i % 2 === 0 ? -1 : 1) * usableShort) / 4 : 0
    // Seeded jitter, then clamp to keep the prop on the surface.
    local += (rand() - 0.5) * 2 * POS_JITTER
    lateral += (rand() - 0.5) * 2 * POS_JITTER
    local = Math.max(-halfLong, Math.min(halfLong, local))
    lateral = Math.max(-halfShort, Math.min(halfShort, lateral))

    // Map local (long, short) → local (du = X, dv = Z) before world rotation.
    const du = longAlongW ? local : lateral
    const dv = longAlongW ? lateral : local
    // Rotate local offset by host yaw into world X/Z.
    const x = host.position[0] + du * cos - dv * sin
    const z = host.position[1] + du * sin + dv * cos
    out.push([x, z])
  }
  return out
}

/** Per-prop seeded yaw jitter around the host facing (RD408-003). */
function propRotation(host: FurnitureItem, propId: string, rand: () => number): number {
  const span = ROT_JITTER_BY_PROP[propId] ?? ROT_JITTER
  return host.rotation + (rand() - 0.5) * span
}

/**
 * Given a list of already-arranged items (for one or all rooms), return
 * supplementary decor prop items placed on appropriate host surfaces.
 *
 * @param arranged   Arranged furniture items (after autoArrange / furnishPlan).
 * @param defs       Furniture catalog (for footprint + prop defaults).
 * @param seed       Deterministic seed (default 42).
 */
export function applyDecorStyling(
  arranged: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  seed = 42,
): FurnitureItem[] {
  const rand = mulberry32(seed)
  const result: FurnitureItem[] = []
  const usedIds = new Set<string>() // guard idempotency on repeated calls

  // Group hosts by their identity so multiple sofas each get their own budget.
  const hosts = arranged.filter((it) => isHost(it.defId))

  for (const host of hosts) {
    const candidateProps = HOST_PROPS[host.defId]
    if (!candidateProps || candidateProps.length === 0) continue

    const hostDef = defs[host.defId]
    const footprint = hostFootprint(host, hostDef)
    const hostArea = footprint.w * footprint.d
    if (hostArea < MIN_HOST_AREA) continue

    const topHeight = surfaceTopHeight(host, hostDef)
    const budget = surfaceBudget(host, hostArea)
    const positions = slotPositions(host, footprint, budget, rand)

    let placed = 0
    for (let slot = 0; slot < budget; slot++) {
      // Cycle through the priority list so a high budget reuses props in order.
      const propId = candidateProps[slot % candidateProps.length]
      const propDef = defs[propId]
      if (!propDef) continue

      const baseProps: ParamProps = propDef.kind === 'parametric' ? defaultParamProps(propDef) : {}
      const props: ParamProps = { ...baseProps, surfaceHeight: topHeight }
      // Seeded colour variety for repeated soft goods / books (RD-408): offset by
      // the slot so adjacent same-type props differ, plus a seeded start so hosts
      // aren't all identical.
      const variety = VARIETY[propId]
      if (variety) {
        const pal = variety.palette
        props[variety.key] = pal[(slot + Math.floor(rand() * pal.length)) % pal.length]
        if (variety.enums) {
          for (const [k, opts] of Object.entries(variety.enums)) {
            props[k] = opts[Math.floor(rand() * opts.length)]
          }
        }
      }

      const id = `decor-${host.id}-${propId}-${slot}`
      if (usedIds.has(id)) continue
      usedIds.add(id)

      result.push({
        id,
        defId: propId as FurnitureItem['defId'],
        position: positions[slot],
        rotation: propRotation(host, propId, rand),
        elevation: topHeight,
        props,
      })
      placed++
    }
    void placed
  }

  return result
}

/**
 * Convenience: apply the decor styling pass per-room for a user-authored plan.
 * Each room is styled with an independent seed derived from the base seed + its
 * index so rooms look distinct but are still deterministic. A per-room total cap
 * (ROOM_DECOR_CAP) keeps density bounded for taste + perf — surplus props are
 * trimmed lowest-priority-first (the styling pass already emits hosts in order,
 * so trimming from the tail drops the least-important props).
 *
 * @param plan       The floor plan (rooms used for boundary checks).
 * @param arranged   Arranged furniture items across all rooms.
 * @param defs       Furniture catalog.
 * @param seed       Base seed (default 42).
 */
export function applyDecorStylingForPlan(
  plan: FloorPlan,
  arranged: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  seed = 42,
): FurnitureItem[] {
  const allDecor: FurnitureItem[] = []
  plan.rooms.forEach((room: PlanRoom, idx: number) => {
    const roomItems = arranged.filter((it) => pointInRoom(room, it.position[0], it.position[1]))
    const roomDecor = applyDecorStyling(roomItems, defs, seed + idx * 997)
    // Per-room total cap — trim the tail (lowest-priority props placed last).
    allDecor.push(...roomDecor.slice(0, ROOM_DECOR_CAP))
  })
  return allDecor
}
