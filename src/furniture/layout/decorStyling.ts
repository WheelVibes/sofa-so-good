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
 * Each host surface contributes at most MAX_PER_HOST props.
 * Positions are placed at the host's [x, z] (footprint centre on the floor
 * plane) — since all decor props are `noClip` they never require a floor
 * collision check; only `surfaceHeight` is set via the host's top height.
 *
 * Pure + deterministic (no store, no GPU) → unit-testable. Seedable via the
 * optional `seed` parameter so results are stable in tests.
 */

import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { pointInRoom } from '../../floorplan/types'
import type { FurnitureDef, FurnitureItem, ParamProps } from '../types'
import { defaultParamProps } from '../types'

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum decor props placed on a single host surface. */
const MAX_PER_HOST = 2

/** Minimum host surface footprint (m²) before we consider it too small to dress. */
const MIN_HOST_AREA = 0.12

// ── Host-surface definitions ─────────────────────────────────────────────────

/** Decor prop ids that may be placed on a given host. Priority order: the first
 *  props listed are preferred; we stop at MAX_PER_HOST. */
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

/** True when `defId` is a known host surface we style onto. */
function isHost(defId: string): boolean {
  return defId in HOST_PROPS
}

/** Pick a small offset from the host centre so two props on the same surface
 *  don't sit directly on top of each other. */
function offsetPos(host: FurnitureItem, slotIndex: number, rand: () => number): [number, number] {
  // Quarter the host footprint to spread props slightly. A small random
  // jitter keeps sequential rooms from looking identical.
  const jitterX = (rand() - 0.5) * 0.06
  const jitterZ = (rand() - 0.5) * 0.06
  // Two offsets: left-of-centre for slot 0, right-of-centre for slot 1.
  const spreadX = slotIndex === 0 ? -0.12 : 0.12
  return [host.position[0] + spreadX + jitterX, host.position[1] + jitterZ]
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
  const usedProps = new Set<string>() // guard idempotency on repeated calls

  // Group hosts by their identity so multiple sofas each get their own budget.
  const hosts = arranged.filter((it) => isHost(it.defId))

  for (const host of hosts) {
    const candidateProps = HOST_PROPS[host.defId]
    if (!candidateProps || candidateProps.length === 0) continue

    const hostDef = defs[host.defId]
    const hostArea = hostDef ? hostDef.defaultFootprint.w * hostDef.defaultFootprint.d : 0.3
    if (hostArea < MIN_HOST_AREA) continue

    const topHeight = surfaceTopHeight(host, hostDef)
    let placed = 0

    for (const propId of candidateProps) {
      if (placed >= MAX_PER_HOST) break
      const propDef = defs[propId]
      if (!propDef) continue

      const pos = offsetPos(host, placed, rand)
      const baseProps: ParamProps = propDef.kind === 'parametric' ? defaultParamProps(propDef) : {}
      const props: ParamProps = { ...baseProps, surfaceHeight: topHeight }

      const id = `decor-${host.id}-${propId}-${placed}`
      if (usedProps.has(id)) continue
      usedProps.add(id)

      result.push({
        id,
        defId: propId as FurnitureItem['defId'],
        position: pos,
        rotation: 0,
        elevation: topHeight,
        props,
      })
      placed++
    }
  }

  return result
}

/**
 * Convenience: apply the decor styling pass per-room for a user-authored plan.
 * Each room is styled with an independent seed derived from the base seed + its
 * index so rooms look distinct but are still deterministic.
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
    allDecor.push(...roomDecor)
  })
  return allDecor
}
