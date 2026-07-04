import { canPlace } from '../collision/placement'
import type { FurnitureDef, FurnitureItem } from './types'

/** Shared offsets tried first so a duplicated selection keeps its arrangement;
 *  the first that frees every copy wins. */
const SHARED_DELTAS: [number, number][] = [
  [0.4, 0.4],
  [0.7, 0],
  [0, 0.7],
  [-0.7, 0],
  [0, -0.7],
  [1, 1],
  [-1, -1],
  [1.5, 0],
  [0, 1.5],
  [2, 2],
]

interface PlanCtx {
  others: FurnitureItem[]
  defs: Record<string, FurnitureDef>
  doors: Record<string, { open: boolean }>
}

/** Clone one source item under a fresh id, with its own props copy and the
 *  shared groupId patch (present when `groupId` is given, cleared otherwise —
 *  a duplicate never silently inherits the source's group unless the caller
 *  explicitly re-groups the copies). The one clone "shape" every duplicate
 *  path (offset placement, spiral fallback, in-place drag-clone) shares. */
function cloneItem(src: FurnitureItem, id: string, groupId?: string): FurnitureItem {
  const item: FurnitureItem = { ...src, id, props: { ...src.props } }
  return groupId ? { ...item, groupId } : { ...item, groupId: undefined }
}

/**
 * Plan collision-free copies of `sources`. Pure (no store writes): first tries
 * a single shared offset (preserving the relative arrangement) and returns the
 * first that frees *every* copy; if the layout is too tight it falls back to a
 * per-item spiral so duplicating still yields copies. Each copy gets a fresh id
 * from `mkId` and (optionally) a shared `groupId`. Returns the items to add
 * (empty if nothing could be placed).
 */
export function planDuplicates(
  sources: FurnitureItem[],
  ctx: PlanCtx,
  mkId: (index: number) => string,
  groupId?: string,
): FurnitureItem[] {
  if (sources.length === 0) return []

  // 1. Shared offset — arrangement preserved.
  for (const [dx, dz] of SHARED_DELTAS) {
    const trial: FurnitureItem[] = []
    let others = ctx.others
    let allFit = true
    for (const src of sources) {
      const def = ctx.defs[src.defId]
      if (!def) {
        allFit = false
        break
      }
      const pos: [number, number] = [src.position[0] + dx, src.position[1] + dz]
      if (!canPlace({ ...src, id: 'dup-probe', position: pos }, def, { ...ctx, others })) {
        allFit = false
        break
      }
      const ni = cloneItem({ ...src, position: pos }, mkId(trial.length), groupId)
      trial.push(ni)
      others = [...others, ni]
    }
    if (allFit && trial.length === sources.length) return trial
  }

  // 2. Per-item spiral fallback — placement guaranteed where space exists.
  const copies: FurnitureItem[] = []
  let others = ctx.others
  for (const src of sources) {
    const def = ctx.defs[src.defId]
    if (!def) continue
    let placed: [number, number] | null = null
    for (let ring = 1; ring <= 8 && !placed; ring++) {
      for (let dx = -ring; dx <= ring && !placed; dx++) {
        for (let dz = -ring; dz <= ring && !placed; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue
          const pos: [number, number] = [src.position[0] + dx * 0.3, src.position[1] + dz * 0.3]
          if (canPlace({ ...src, id: 'dup-probe', position: pos }, def, { ...ctx, others })) {
            placed = pos
          }
        }
      }
    }
    if (!placed) continue
    const ni = cloneItem({ ...src, position: placed }, mkId(copies.length), groupId)
    copies.push(ni)
    others = [...others, ni]
  }
  return copies
}

/**
 * Clone `sources` IN PLACE — same position/rotation/props, only a fresh id
 * (+ the same shared-groupId patch `planDuplicates` applies). No offset
 * search and no collision check: used by Alt-drag-duplicate (FEAT-B), whose
 * caller immediately starts dragging the copy away from the source, so
 * spawning it exactly where the source sits (then letting the normal drag
 * collision/snap pipeline take over) is correct — unlike `planDuplicates`'
 * nearby-placement use case (Duplicate button / ⌘D), which never gets a
 * follow-up drag and so must land collision-free right away. */
export function cloneItemsInPlace(
  sources: FurnitureItem[],
  mkId: (index: number) => string,
  groupId?: string,
): FurnitureItem[] {
  return sources.map((src, i) => cloneItem(src, mkId(i), groupId))
}
