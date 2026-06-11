/**
 * Placement collision orchestrator.
 *
 * Decides whether a candidate furniture item — given its def and the
 * current door + items state — fits the apartment without clipping a
 * wall or another item. Reuses:
 *   - OBB math from ./obb.ts
 *   - door-aware wall segments from ./wallsFromState.ts
 *   - the cached GLB footprint from ../furniture/GltfModel.ts
 */

import { getCachedGltfFootprint } from '../furniture/GltfModel'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { type AabbItem, buildGrid, candidatePairs } from './broadphase'
import { type OBB, obbVsObb } from './obb'
import type { CollisionWall } from './walls'
import { buildCollisionWalls } from './wallsFromState'

/** Convert a thick wall segment to an OBB so OBB-vs-OBB SAT can detect
 *  furniture poking into the wall *body*, not just past its centerline. */
function wallToObb(w: CollisionWall): OBB {
  const dx = w.bx - w.ax
  const dz = w.bz - w.az
  const length = Math.hypot(dx, dz)
  return {
    cx: (w.ax + w.bx) / 2,
    cz: (w.az + w.bz) / 2,
    hx: length / 2,
    hz: w.thickness / 2,
    rot: Math.atan2(dz, dx),
  }
}

/** Returns the OBB footprint of an item using the def's defaultFootprint
 *  modified by parametric overrides where the schema exposes them. */
export function itemFootprint(item: FurnitureItem, def: FurnitureDef): OBB {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  // Local-space center offset of the GLB bbox. Many models are authored
  // off-origin; without this the OBB drifts from the rendered geometry.
  let ox = 0
  let oz = 0

  if (def.kind === 'parametric') {
    // Recompute footprint from live params using the def's mapping; falls
    // back to the standard 'width' / 'depth' keys.
    const map = def.footprintParams ?? {}
    const wKey = map.w ?? 'width'
    const dKey = map.d ?? 'depth'
    const wv = item.props[wKey]
    const dv = item.props[dKey]
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  } else {
    // For any GLB-backed def (builtin / user upload / remote / pack),
    // prefer the cached real bounding box over the def's authored
    // defaultFootprint — uploads default to a 1×1×1 placeholder, and
    // remote/pack entries may be inaccurate too.
    const url = def.source === 'builtin' ? def.url : def.runtimeUrl
    const cached = url ? getCachedGltfFootprint(url) : null
    if (cached) {
      w = cached.w
      d = cached.d
      ox = cached.ox
      oz = cached.oz
    }
  }

  const defScale = def.kind === 'parametric' ? undefined : def.scale
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : defScale) ?? 1
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  const sx = ox * scale
  const sz = oz * scale

  return {
    cx: item.position[0] + cos * sx - sin * sz,
    cz: item.position[1] + sin * sx + cos * sz,
    hx: (w * scale) / 2,
    hz: (d * scale) / 2,
    rot: item.rotation,
  }
}

interface PlacementContext {
  others: FurnitureItem[]
  defs: Record<string, FurnitureDef>
  doors: Record<string, { open: boolean }>
  /** Optional collision walls override (e.g. a user-authored floor plan).
   *  When omitted, the fixed flat's door-aware walls are used. */
  walls?: CollisionWall[]
}

/** Vertical extent of an item in metres above the floor, for height-aware
 *  collision. Falls back to [0, footprint height]. Surface items (those with
 *  a `surfaceHeight` prop — lamps, monitors, decor) shift their span to sit
 *  on the surface they're placed on, so they don't falsely collide with
 *  tables of different heights. */
function verticalSpan(item: FurnitureItem, def: FurnitureDef): { base: number; top: number } {
  const span = def.verticalSpan ?? { base: 0, top: def.defaultFootprint.h }
  const sh = item.props['surfaceHeight']
  if (typeof sh === 'number') {
    return { base: sh, top: sh + (span.top - span.base) }
  }
  return span
}

/** True iff two vertical spans overlap (touching edges don't count). */
function spansOverlap(a: { base: number; top: number }, b: { base: number; top: number }): boolean {
  return a.base < b.top - 1e-6 && b.base < a.top - 1e-6
}

/** Returns true iff `item` can be placed without overlapping a (closed-door-
 *  aware) wall segment or any other item. The candidate item's id is
 *  ignored when scanning `others`, so this also works for "can the item
 *  stay where it is after a transform?" checks. */
export function canPlace(item: FurnitureItem, def: FurnitureDef, ctx: PlacementContext): boolean {
  // Flat floor coverings (rugs) sit under everything and never collide.
  if (def.noClip) return true

  const obb = itemFootprint(item, def)

  // Walls — tested as full-thickness OBBs so an item placed flush
  // against the visible interior face still has to clear the wall body.
  // Mounted items (wall aircon, ceiling lights) are exempt.
  if (!def.mounted) {
    const walls = ctx.walls ?? buildCollisionWalls(ctx.doors)
    for (const seg of walls) {
      if (obbVsObb(obb, wallToObb(seg))) return false
    }
  }

  // Other furniture — height-aware: only collide when the 2D footprints
  // overlap AND the vertical spans intersect, so a pendant can hang over a
  // table or a wall unit sit above a wardrobe.
  const span = verticalSpan(item, def)
  for (const other of ctx.others) {
    if (other.id === item.id) continue
    if (itemsCollide(item, def, span, other, ctx.defs[other.defId])) return false
  }

  return true
}

/** Shared furniture-vs-furniture overlap test (the exact rule `canPlace` uses
 *  per pair): height-aware, group-mate- and rug-exempt. `aSpan` is `a`'s
 *  pre-computed vertical span (callers usually have it to hand). */
function itemsCollide(
  a: FurnitureItem,
  aDef: FurnitureDef,
  aSpan: { base: number; top: number },
  b: FurnitureItem,
  bDef: FurnitureDef | undefined,
): boolean {
  if (!bDef) return false
  if (bDef.noClip) return false
  // Different storeys never collide (F13/ML3) — an upstairs bed isn't in the
  // way of the sofa under it. Absent levelId = ground.
  if ((a.levelId ?? 'ground') !== (b.levelId ?? 'ground')) return false
  // Group-mates never collide with each other — a stacked mattress sits inside
  // its frame's OBB by design, and grouped pieces move as a unit.
  if (a.groupId && b.groupId === a.groupId) return false
  if (!spansOverlap(aSpan, verticalSpan(b, bDef))) return false
  return obbVsObb(itemFootprint(a, aDef), itemFootprint(b, bDef))
}

/** An unordered pair of placed-item ids whose footprints intersect. */
export interface OverlapPair {
  a: string
  b: string
}

/**
 * Every pair of placed items that overlap — the same furniture-vs-furniture
 * test {@link canPlace} runs, evaluated across the whole design instead of for
 * one candidate. Because it reuses the OBB + height-aware + group/rug rules it
 * never flags a pendant over a table, a stacked mattress inside its frame, a
 * rug under a sofa, or grouped pieces. Each colliding pair is reported once
 * (`a` before `b` in iteration order). O(n²) over placed items, which is fine
 * for design-scale counts; callers should debounce/gate behind an open panel.
 */
export function findItemOverlaps(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): OverlapPair[] {
  // Broadphase: only run the exact (height-aware) collision test on pairs whose
  // footprint AABBs are near each other — O(n) for sparse designs instead of
  // O(n²), with identical results (candidatePairs is a superset of overlaps).
  const part = items.filter((it) => {
    const d = defs[it.defId]
    return d && !d.noClip
  })
  if (part.length < 2) return []
  const grid = buildGrid(part.map((it) => itemAabbBox(it, defs[it.defId]!)))
  const byId = new Map(part.map((it) => [it.id, it] as const))
  const pairs: OverlapPair[] = []
  for (const [ia, ib] of candidatePairs(grid)) {
    const a = byId.get(ia)
    const b = byId.get(ib)
    if (!a || !b) continue
    const aDef = defs[a.defId]
    if (!aDef) continue
    if (itemsCollide(a, aDef, verticalSpan(a, aDef), b, defs[b.defId]))
      pairs.push({ a: a.id, b: b.id })
  }
  return pairs
}

/** Axis-aligned bounding box of an item footprint OBB (for the broadphase). */
function itemAabbBox(item: FurnitureItem, def: FurnitureDef): AabbItem {
  const o = itemFootprint(item, def)
  const c = Math.abs(Math.cos(o.rot))
  const s = Math.abs(Math.sin(o.rot))
  const hx = c * o.hx + s * o.hz
  const hz = s * o.hx + c * o.hz
  return { id: item.id, minX: o.cx - hx, minZ: o.cz - hz, maxX: o.cx + hx, maxZ: o.cz + hz }
}

/**
 * Ids of placed items whose footprint pokes into a wall *body* — typically
 * furniture left embedded in a wall after the floor plan was edited (moving a
 * wall onto a piece). Uses the same full-thickness wall OBBs `canPlace` rejects
 * against, and the same exemptions: mounted (wall/ceiling) and noClip (rug)
 * items are skipped. Flush-against-the-face placement is *not* flagged — the OBB
 * test tolerates touching — so only genuine penetration is reported. `walls` are
 * the resolved collision walls for the active plan.
 */
export function findWallClips(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
  walls: CollisionWall[],
): string[] {
  if (walls.length === 0) return []
  const wallObbs = walls.map(wallToObb)
  const clipped: string[] = []
  for (const it of items) {
    const def = defs[it.defId]
    if (!def || def.mounted || def.noClip) continue
    const obb = itemFootprint(it, def)
    if (wallObbs.some((w) => obbVsObb(obb, w))) clipped.push(it.id)
  }
  return clipped
}
