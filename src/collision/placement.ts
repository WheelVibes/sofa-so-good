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
import type { FootprintPart, FurnitureDef, FurnitureItem } from '../furniture/types'
import { type AabbItem, buildGrid, candidatePairs, queryRect } from './broadphase'
import { type OBB, obbMtv, obbVsObb } from './obb'
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

/** Resolve an item's effective per-axis scale: uniform `scale` (def scale for
 *  non-parametric, prop `scale` override) with optional per-axis `scaleX`/`scaleZ`
 *  (SweetHome3DJS resize parity). Shared by the single-OBB and per-part footprints. */
function resolveScale(item: FurnitureItem, def: FurnitureDef): { scaleX: number; scaleZ: number } {
  const defScale = def.kind === 'parametric' ? undefined : def.scale
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : defScale) ?? 1
  const scaleX = typeof item.props['scaleX'] === 'number' ? (item.props['scaleX'] as number) : scale
  const scaleZ = typeof item.props['scaleZ'] === 'number' ? (item.props['scaleZ'] as number) : scale
  return { scaleX, scaleZ }
}

/**
 * Resolves a def's raw `footprintParts` spec for an item and mirrors each
 * part's offset across the axes the item is flipped on. `Furniture.tsx`
 * renders a flip as a `scale={[flipX?-1:1, 1, flipZ?-1:1]}` wrapper around the
 * whole primitive (in the item's local, pre-yaw frame) — so an asymmetric
 * shape driven by a def-specific prop (e.g. `sofa-lshape`'s `chaiseSide`,
 * `cabinet-corner`'s fixed L) visually swaps sides on flip even though the
 * prop itself never changes. The footprint must mirror the same way or
 * collision/selection keeps testing the un-flipped shape (BUG:
 * sofa-lshape-chaiseSide-flip). Symmetric parts (round/oval, centred barbell)
 * are unaffected since negating a zero or matching offset is a no-op.
 */
function resolveFootprintParts(
  item: FurnitureItem,
  def: FurnitureDef,
): FootprintPart[] | undefined {
  const spec = def.footprintParts
  const parts = typeof spec === 'function' ? spec(item.props) : spec
  if (!parts || parts.length === 0 || (!item.flipX && !item.flipZ)) return parts
  return parts.map((p) => ({
    ...p,
    dx: item.flipX ? -p.dx : p.dx,
    dz: item.flipZ ? -p.dz : p.dz,
  }))
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
    const url = def.source === 'builtin' || def.source === 'local' ? def.url : def.runtimeUrl
    const cached = url ? getCachedGltfFootprint(url) : null
    if (cached) {
      w = cached.w
      d = cached.d
      ox = cached.ox
      oz = cached.oz
    }
  }

  const { scaleX, scaleZ } = resolveScale(item, def)
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  const sx = ox * scaleX
  const sz = oz * scaleZ

  return {
    cx: item.position[0] + cos * sx - sin * sz,
    cz: item.position[1] + sin * sx + cos * sz,
    hx: (w * scaleX) / 2,
    hz: (d * scaleZ) / 2,
    rot: item.rotation,
  }
}

/**
 * The item's footprint as one or more world-space OBBs. When the def declares
 * `footprintParts` (a convex decomposition of a non-rectangular shape, static or
 * props-driven), each part is mapped into world space — relative to the
 * footprint bbox centre (so a GLB's authored off-origin offset is honoured),
 * with the item's per-axis scale and rotation applied. Otherwise returns the
 * single enclosing OBB. The result drives granular, shape-aware collision; the
 * broadphase AABB ({@link itemAabbBox}) unions these parts so it bounds the true
 * shape.
 */
export function itemFootprintParts(item: FurnitureItem, def: FurnitureDef): OBB[] {
  const parts = resolveFootprintParts(item, def)
  const base = itemFootprint(item, def)
  if (!parts || parts.length === 0) return [base]

  const { scaleX, scaleZ } = resolveScale(item, def)
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  // `base.cx/cz` is the footprint bbox centre in world space (item position +
  // rotated GLB offset). Parts are authored relative to that centre.
  return parts.map((p) => {
    const sdx = p.dx * scaleX
    const sdz = p.dz * scaleZ
    return {
      cx: base.cx + cos * sdx - sin * sdz,
      cz: base.cz + sin * sdx + cos * sdz,
      hx: (p.w * scaleX) / 2,
      hz: (p.d * scaleZ) / 2,
      rot: item.rotation + (p.rot ?? 0),
    }
  })
}

/** One footprint part in the item's LOCAL frame — relative to the footprint
 *  centre, *before* the item's yaw. For rendering a shape-accurate footprint
 *  overlay (selection tint / placement ghost) inside a group already positioned
 *  at the footprint centre and rotated by the item's yaw. */
export interface LocalFootprintPart {
  /** Centre offset from the footprint centre, in metres (pre-yaw). */
  ox: number
  oz: number
  /** Half-extents in metres. */
  hx: number
  hz: number
  /** Extra in-plane rotation of this part (radians), on top of the item yaw. */
  rot: number
}

/**
 * The item's footprint as local parts (see {@link LocalFootprintPart}). Mirrors
 * {@link itemFootprintParts} but keeps the parts in the item's local frame so a
 * renderer can drop them into a group that already owns the world position + yaw.
 * A composite def yields its convex parts (scaled); any other def yields a single
 * centred part equal to the enclosing footprint — so the caller renders one plane
 * either way, and the single-part case is pixel-identical to the old box overlay.
 */
export function itemFootprintPartsLocal(
  item: FurnitureItem,
  def: FurnitureDef,
): LocalFootprintPart[] {
  const parts = resolveFootprintParts(item, def)
  const { scaleX, scaleZ } = resolveScale(item, def)
  if (!parts || parts.length === 0) {
    const obb = itemFootprint(item, def)
    return [{ ox: 0, oz: 0, hx: obb.hx, hz: obb.hz, rot: 0 }]
  }
  return parts.map((p) => ({
    ox: p.dx * scaleX,
    oz: p.dz * scaleZ,
    hx: (p.w * scaleX) / 2,
    hz: (p.d * scaleZ) / 2,
    rot: p.rot ?? 0,
  }))
}

/**
 * The minimum spanning box of the item's footprint, in the item's LOCAL frame
 * *relative to the {@link itemFootprint} OBB centre* (so a caller with a group
 * already at that centre + item yaw drops the box in with a plain offset). For a
 * composite def this unions the convex parts (the L-sofa's true main-run+chaise
 * shape, ~2× deeper than its depth-only enclosing OBB); for any other def it's
 * the enclosing OBB itself (`{0, 0, hx, hz}`) — the resize/selection box then
 * tightly bounds the real geometry instead of a too-shallow rectangle.
 */
export function itemFootprintSpanLocal(
  item: FurnitureItem,
  def: FurnitureDef,
): { ox: number; oz: number; hx: number; hz: number } {
  const obb = itemFootprint(item, def)
  const parts = resolveFootprintParts(item, def)
  if (!parts || parts.length === 0) return { ox: 0, oz: 0, hx: obb.hx, hz: obb.hz }

  const { scaleX, scaleZ } = resolveScale(item, def)
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const p of parts) {
    const ox = p.dx * scaleX
    const oz = p.dz * scaleZ
    const c = Math.abs(Math.cos(p.rot ?? 0))
    const s = Math.abs(Math.sin(p.rot ?? 0))
    const hx = (p.w * scaleX) / 2
    const hz = (p.d * scaleZ) / 2
    const ex = c * hx + s * hz
    const ez = s * hx + c * hz
    if (ox - ex < minX) minX = ox - ex
    if (oz - ez < minZ) minZ = oz - ez
    if (ox + ex > maxX) maxX = ox + ex
    if (oz + ez > maxZ) maxZ = oz + ez
  }
  return {
    ox: (minX + maxX) / 2,
    oz: (minZ + maxZ) / 2,
    hx: (maxX - minX) / 2,
    hz: (maxZ - minZ) / 2,
  }
}

/**
 * True when a world-space floor point lies within the item's min-span footprint
 * polygon — the enclosing rectangle of all footprint parts ({@link
 * itemFootprintSpanLocal}), transformed into the item's local (pre-yaw) frame.
 * Drives footprint-restricted hover (HOVER-FOOTPRINT): the piece highlights only
 * when the cursor's floor projection is inside its footprint, so tall geometry
 * that overhangs the base doesn't light it up. Pure + unit-tested.
 */
export function floorPointInFootprint(
  fx: number,
  fz: number,
  item: FurnitureItem,
  def: FurnitureDef,
): boolean {
  const base = itemFootprint(item, def)
  const span = itemFootprintSpanLocal(item, def)
  const rx = fx - base.cx
  const rz = fz - base.cz
  // Rotate the world-space delta into the item's local frame (inverse yaw).
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  const lx = cos * rx + sin * rz
  const lz = -sin * rx + cos * rz
  return Math.abs(lx - span.ox) <= span.hx && Math.abs(lz - span.oz) <= span.hz
}

/** True iff any OBB in `a` overlaps any OBB in `b` (granular part-vs-part SAT). */
function partsOverlap(a: OBB[], b: OBB[]): boolean {
  for (const oa of a) for (const ob of b) if (obbVsObb(oa, ob)) return true
  return false
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
  const base0 = typeof sh === 'number' ? sh : span.base
  const height = span.top - span.base
  // Per-item elevation raises the whole piece off the floor (SH3D parity), so
  // its height-aware collision span shifts up with it.
  const lift = item.elevation ?? 0
  return { base: base0 + lift, top: base0 + height + lift }
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

  const parts = itemFootprintParts(item, def)

  // Walls — tested as full-thickness OBBs so an item placed flush
  // against the visible interior face still has to clear the wall body.
  // Mounted items (wall aircon, ceiling lights) are exempt.
  if (!def.mounted) {
    const walls = ctx.walls ?? buildCollisionWalls(ctx.doors)
    for (const seg of walls) {
      const wobb = wallToObb(seg)
      if (parts.some((p) => obbVsObb(p, wobb))) return false
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

/**
 * Soft push-apart: when `item` is placed on an overlapping (invalid) spot, find
 * the nearest valid resting position by nudging it OUT of the collision — a
 * gentle slide off the obstacle instead of a hard block/revert. Uses the SAT
 * {@link obbMtv} against nearby furniture parts + walls only to pick a *push
 * direction*, then steps outward along it (with a small fan) verifying each
 * candidate with {@link canPlace} — so validity (height spans, group/rug/mounted
 * exemptions, doors) is always the real rule, never a duplicated approximation.
 * Bounded by `maxStep` (m) so it settles beside the obstacle, never teleports.
 * Returns the resolved `[x, z]`, the current position if already valid, or
 * `null` if no valid spot is within reach (caller keeps its hard-revert).
 */
export function nudgeToValid(
  item: FurnitureItem,
  def: FurnitureDef,
  ctx: PlacementContext,
  maxStep = 0.4,
  step = 0.03,
): [number, number] | null {
  if (canPlace(item, def, ctx)) return [item.position[0], item.position[1]]

  // Obstacle OBBs — a direction heuristic only (canPlace is the truth), so we
  // don't need canPlace's exact exemptions here; skip rugs + (for a mounted
  // item) walls, which never block it.
  const obstacles: OBB[] = []
  for (const o of ctx.others) {
    if (o.id === item.id) continue
    const od = ctx.defs[o.defId]
    if (!od || od.noClip) continue
    for (const p of itemFootprintParts(o, od)) obstacles.push(p)
  }
  if (!def.mounted) {
    const walls = ctx.walls ?? buildCollisionWalls(ctx.doors)
    for (const w of walls) obstacles.push(wallToObb(w))
  }

  const parts = itemFootprintParts(item, def)
  let dirX = 0
  let dirZ = 0
  let best = 0
  for (const p of parts) {
    for (const ob of obstacles) {
      const m = obbMtv(p, ob)
      if (m && m.depth > best) {
        best = m.depth
        dirX = m.nx
        dirZ = m.nz
      }
    }
  }
  if (best === 0) return null // overlaps something canPlace flags but no OBB dir

  // Step outward along the push direction, plus a small ± fan so it can round a
  // corner, taking the first canPlace-valid spot within `maxStep`.
  const fan = [0, 0.5, -0.5, 1.0, -1.0]
  const [ox, oz] = item.position
  for (let d = step; d <= maxStep + 1e-9; d += step) {
    for (const a of fan) {
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const nx = dirX * ca - dirZ * sa
      const nz = dirX * sa + dirZ * ca
      const pos: [number, number] = [ox + nx * d, oz + nz * d]
      if (canPlace({ ...item, position: pos }, def, ctx)) return pos
    }
  }
  return null
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
  return partsOverlap(itemFootprintParts(a, aDef), itemFootprintParts(b, bDef))
}

/** An unordered pair of placed-item ids whose footprints intersect. */
export interface OverlapPair {
  a: string
  b: string
}

// Frame-scoped broadphase memo (PERF-FOLLOWUPS): several panels (Clearance,
// Design score, report) can each run the design-wide scan in the same render
// pass, so repeated calls with the *same* items/defs identities reuse the
// computed result. The memo deliberately expires at the end of the current
// task (microtask flush ≤ one frame) rather than living unboundedly: the OBBs
// read the mutable GLB-footprint cache, which can populate *after* a result is
// computed without the items array identity changing. Single slot + module
// fields keeps it allocation-free on the hit path.
let overlapMemoItems: FurnitureItem[] | null = null
let overlapMemoDefs: Record<string, FurnitureDef> | null = null
let overlapMemoResult: OverlapPair[] | null = null
let overlapMemoFlushQueued = false

function invalidateOverlapMemo(): void {
  overlapMemoItems = null
  overlapMemoDefs = null
  overlapMemoResult = null
  overlapMemoFlushQueued = false
}

/**
 * Every pair of placed items that overlap — the same furniture-vs-furniture
 * test {@link canPlace} runs, evaluated across the whole design instead of for
 * one candidate. Because it reuses the OBB + height-aware + group/rug rules it
 * never flags a pendant over a table, a stacked mattress inside its frame, a
 * rug under a sofa, or grouped pieces. Each colliding pair is reported once
 * (`a` before `b` in iteration order). O(n²) over placed items, which is fine
 * for design-scale counts; callers should debounce/gate behind an open panel.
 *
 * Repeated same-frame calls with unchanged `items`/`defs` *identities* return
 * the cached result array (see the memo note above); a new array/record —
 * which is how the store publishes any item-set change — recomputes.
 */
export function findItemOverlaps(
  items: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): OverlapPair[] {
  if (overlapMemoResult !== null && overlapMemoItems === items && overlapMemoDefs === defs) {
    return overlapMemoResult
  }
  const result = computeItemOverlaps(items, defs)
  overlapMemoItems = items
  overlapMemoDefs = defs
  overlapMemoResult = result
  if (!overlapMemoFlushQueued) {
    overlapMemoFlushQueued = true
    queueMicrotask(invalidateOverlapMemo)
  }
  return result
}

function computeItemOverlaps(
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

/** Axis-aligned bounding box of an item footprint (for the broadphase). Unions
 *  the AABBs of every footprint **part**, so a composite (L-shaped) piece's box
 *  bounds its true collision shape — the broadphase must stay a *superset* of the
 *  narrowphase or it would prune a real overlap. For a single-part piece this is
 *  identical to boxing the lone `itemFootprint` OBB. */
export function itemAabbBox(item: FurnitureItem, def: FurnitureDef): AabbItem {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const o of itemFootprintParts(item, def)) {
    const c = Math.abs(Math.cos(o.rot))
    const s = Math.abs(Math.sin(o.rot))
    const hx = c * o.hx + s * o.hz
    const hz = s * o.hx + c * o.hz
    if (o.cx - hx < minX) minX = o.cx - hx
    if (o.cz - hz < minZ) minZ = o.cz - hz
    if (o.cx + hx > maxX) maxX = o.cx + hx
    if (o.cz + hz > maxZ) maxZ = o.cz + hz
  }
  return { id: item.id, minX, minZ, maxX, maxZ }
}

/**
 * Broadphase prune of a candidate's item-vs-item neighbour set (PERF-003,
 * applied to the auto-arrange tidy pass — see `layout/autoArrange.ts`).
 *
 * Returns the subset of `others` whose footprint AABB overlaps `candidate`'s —
 * a SUPERSET of the items that could collide, so feeding it as `canPlace`'s
 * `others` yields the *identical* boolean: an item whose AABB does not overlap
 * the candidate's cannot have an overlapping OBB (`itemsCollide` would reject
 * it), and defless items never collide (`itemsCollide` returns false on a
 * missing def), so they are safe to drop here too.
 *
 * The wall-collision arm of `canPlace` is untouched (it does not scan `others`),
 * so restricting `others` cannot change wall results.
 */
export function broadphaseNeighbours(
  candidate: FurnitureItem,
  def: FurnitureDef,
  others: FurnitureItem[],
  defs: Record<string, FurnitureDef>,
): FurnitureItem[] {
  // Rugs (noClip) never collide and the candidate's own id is filtered by id.
  if (others.length === 0) return others
  const boxed: { item: FurnitureItem; box: AabbItem }[] = []
  for (const o of others) {
    const od = defs[o.defId]
    if (!od) continue // defless → never collides; safe to exclude
    boxed.push({ item: o, box: itemAabbBox(o, od) })
  }
  if (boxed.length === 0) return []
  const grid = buildGrid(boxed.map((b) => b.box))
  const candBox = itemAabbBox(candidate, def)
  const nearIds = new Set(queryRect(grid, candBox))
  return boxed.filter((b) => nearIds.has(b.item.id)).map((b) => b.item)
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
    const parts = itemFootprintParts(it, def)
    if (wallObbs.some((w) => parts.some((p) => obbVsObb(p, w)))) clipped.push(it.id)
  }
  return clipped
}
