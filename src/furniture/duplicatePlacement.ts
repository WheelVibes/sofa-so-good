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
  const groupPatch = (i: FurnitureItem): FurnitureItem =>
    groupId ? { ...i, groupId } : { ...i, groupId: undefined }

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
      const ni = groupPatch({
        ...src,
        id: mkId(trial.length),
        position: pos,
        props: { ...src.props },
      })
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
    const ni = groupPatch({
      ...src,
      id: mkId(copies.length),
      position: placed,
      props: { ...src.props },
    })
    copies.push(ni)
    others = [...others, ni]
  }
  return copies
}
