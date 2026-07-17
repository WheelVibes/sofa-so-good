/**
 * Single-item starter placement (roomStarters, UX-research pick #5).
 *
 * Given the free/usable rects of the room being edited, find ONE sensibly-placed,
 * collision-clean transform for a starter anchor piece (a bed, sofa, …) dropped
 * into an otherwise-empty room. This is the per-tap "add one sensibly-placed
 * piece" the empty-room chips use — deliberately NOT a full auto-furnish (the
 * `SmartStartWizard` owns that).
 *
 * Design-rule anchoring (`docs/interior-design-guidelines.md`): anchors sit
 * FLUSH against a wall facing inward. We try each wall of the largest free rect
 * (wall-flush midpoint, facing inward), then the rect centre, and return the
 * first candidate that passes `canPlace` against the room's walls + whatever is
 * already placed. If nothing validates (a room too tight for even a centred
 * piece — vanishingly rare for a real room + a starter anchor), we fall back to
 * the largest rect's centre unvalidated so a tap always adds something the user
 * can then drag.
 *
 * Pure + render/store-agnostic (no three, no React, no store) — unit-tested. It
 * REUSES the shared collision/geometry primitives (`canPlace`, `inward`), never
 * a parallel system, exactly like `scatterInRoom`.
 */
import { canPlace } from '../collision/placement'
import type { CollisionWall } from '../collision/walls'
import type { FurnitureDef, FurnitureItem, ParamProps } from '../furniture/types'
import { clamp, type Edge, inward } from './arrangeGeometry'
import { CLEARANCE } from './designRules'

/** An axis-aligned usable rect in the apartment/world frame (matches both the
 *  built-in `RoomShell` and custom-plan `PlanRoomShell` `rects` shape). */
export interface StarterRect {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** A resolved starter placement — floor position + inward-facing yaw. */
export interface StarterPlacement {
  position: [number, number]
  rotation: number
  /** Whether the returned transform passed `canPlace` (false only for the
   *  last-resort unvalidated centre fallback). */
  valid: boolean
}

export interface PlaceStarterOptions {
  /** The room's usable/free rects (world frame). The largest by area is used. */
  rects: readonly StarterRect[]
  /** The def being placed — resolves the footprint for collision. */
  def: FurnitureDef
  /** Props the item will be placed with (drives a parametric footprint). */
  props: ParamProps
  /** The def id, so the collision probe resolves against `defs`. */
  defId: string
  /** Items already in the room (obstacles). Empty for a fresh empty room. */
  existing?: readonly FurnitureItem[]
  /** Catalog for resolving `existing` items' footprints. */
  defs: Record<string, FurnitureDef>
  /** Open/closed door state for wall-aware collision. */
  doors?: Record<string, { open: boolean }>
  /** The room's solid perimeter walls (e.g. `placementWalls(state)`); when
   *  omitted `canPlace` builds the default flat's door-aware walls itself. */
  walls?: CollisionWall[]
  /** The storey the piece sits on (collision is level-gated). */
  levelId?: string
}

/** Base (unrotated) footprint from the def + parametric overrides — mirrors
 *  `autoArrange.ts:baseFootprint` (kept local so this stays self-contained). */
function footprintOf(def: FurnitureDef, props: ParamProps): { w: number; d: number } {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = props[map.w ?? 'width']
    const dv = props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }
  return { w, d }
}

/** The largest rect by floor area, or null for no rects. */
function largestRect(rects: readonly StarterRect[]): StarterRect | null {
  let best: StarterRect | null = null
  let bestArea = -1
  for (const r of rects) {
    const area = (r.x1 - r.x0) * (r.z1 - r.z0)
    if (area > bestArea) {
      bestArea = area
      best = r
    }
  }
  return best
}

/** Wall-flush midpoint position for `edge` of `rect`, footprint depth `d` (its
 *  wall-facing extent) snugged against the wall with a skirting gap; along-wall
 *  coordinate is the wall midpoint clamped so the width `w` stays inside. */
function flushCandidate(
  rect: StarterRect,
  edge: Edge,
  w: number,
  d: number,
  gap: number,
): [number, number] {
  const midX = (rect.x0 + rect.x1) / 2
  const midZ = (rect.z0 + rect.z1) / 2
  const along = w / 2
  if (edge === 'N') return [clamp(midX, rect.x0 + along, rect.x1 - along), rect.z0 + d / 2 + gap]
  if (edge === 'S') return [clamp(midX, rect.x0 + along, rect.x1 - along), rect.z1 - d / 2 - gap]
  if (edge === 'W') return [rect.x0 + d / 2 + gap, clamp(midZ, rect.z0 + along, rect.z1 - along)]
  return [rect.x1 - d / 2 - gap, clamp(midZ, rect.z0 + along, rect.z1 - along)]
}

const EDGE_ORDER: readonly Edge[] = ['N', 'S', 'W', 'E']

/**
 * Resolve a starter placement for `def` in the given room rects. Returns null
 * only when there are no usable rects; otherwise always returns a transform
 * (`valid` reflects whether it passed collision).
 */
export function placeStarterItem(opts: PlaceStarterOptions): StarterPlacement | null {
  const rect = largestRect(opts.rects)
  if (!rect) return null

  const { w, d } = footprintOf(opts.def, opts.props)
  const gap = CLEARANCE.wallGap
  const others = (opts.existing ?? []).slice()
  const defs = { ...opts.defs, [opts.defId]: opts.def }

  const probeAt = (position: [number, number], rotation: number): boolean => {
    const probe: FurnitureItem = {
      id: '__starter_probe__',
      defId: opts.defId,
      position,
      rotation,
      props: opts.props,
      ...(opts.levelId ? { levelId: opts.levelId } : {}),
    }
    return canPlace(probe, opts.def, {
      others,
      defs,
      doors: opts.doors ?? {},
      walls: opts.walls,
    })
  }

  // 1) Wall-flush against each wall (design-rule anchoring), facing inward.
  for (const edge of EDGE_ORDER) {
    const rotation = inward(edge)
    const position = flushCandidate(rect, edge, w, d, gap)
    if (probeAt(position, rotation)) return { position, rotation, valid: true }
  }

  // 2) Rect centre, facing +Z (default facing).
  const centre: [number, number] = [(rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2]
  if (probeAt(centre, 0)) return { position: centre, rotation: 0, valid: true }

  // 3) Last resort: centre, unvalidated — a tap always adds something.
  return { position: centre, rotation: 0, valid: false }
}
