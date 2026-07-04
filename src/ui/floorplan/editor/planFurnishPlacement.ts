/**
 * PLAN-FURNISH Phase 1 — pure placement logic for click-to-place furniture in
 * the 2D plan editor. Mirrors the 3D `scene/PlacementGhost.tsx` +
 * `ui/catalog/usePlacementController.ts` pipeline (same `activeDefId` /
 * `ghostRotation` placement-slice state, same `canPlace` collision rule) but
 * stays render/store-free — every input is passed in explicitly — so it's
 * unit-testable without mounting the editor (`editor/CLAUDE.md`: pure modules
 * here take their data as arguments, never read store/DOM/three).
 *
 * `FloorPlanEditor`'s pointer dispatch owns the screen→world mapping (reuses
 * the existing `pointerWorld`/`toPx`) and the store reads/writes; this module
 * only decides *what the ghost looks like* and *what a commit click should do*.
 */
import { canPlace } from '../../../collision/placement'
import type { CollisionWall } from '../../../collision/walls'
import { defaultItemProps } from '../../../furniture/placement/defaultItemProps'
import type { FurnitureDef, FurnitureItem } from '../../../furniture/types'

/** Synthetic id for the plan-space placement preview (never persisted/committed). */
export const PLAN_GHOST_ID = '__plan-ghost'

/** The collision context a plan-ghost validity check needs — the same shape
 *  `canPlace` already takes, named here for readability at call sites. */
export interface PlanGhostContext {
  others: FurnitureItem[]
  defs: Record<string, FurnitureDef>
  doors: Record<string, { open: boolean }>
  walls: CollisionWall[] | undefined
}

/** Build the synthetic ghost item previewed while a def is armed in the plan
 *  editor: def defaults (shared `defaultItemProps`, factored out of the 3D
 *  ghost/controller so all three placement surfaces agree) + rotation = the
 *  def's own default rotation plus whatever the user dialed in with R
 *  (`ghostRotation`, shared with the 3D ghost via `placementSlice`). */
export function buildPlanGhostItem(
  def: FurnitureDef,
  worldPoint: [number, number],
  ghostRotation: number,
  levelId?: string,
): FurnitureItem {
  return {
    id: PLAN_GHOST_ID,
    defId: def.id,
    position: worldPoint,
    rotation: (def.defaultRotation ?? 0) + ghostRotation,
    props: defaultItemProps(def),
    ...(levelId ? { levelId } : {}),
  }
}

/** Window-bound fixtures (curtains/blinds/grilles) snap onto the nearest
 *  window via a dedicated 3D-only branch (`furniture/placement/windowSnap.ts`)
 *  that Phase 1 doesn't port to the plan editor — excluded here rather than
 *  half-supported (a floor-drop `canPlace` check would be meaningless for a
 *  fixture that never rests on the floor). Deferred to a later PLAN-FURNISH
 *  phase alongside the window-snap commit branch. */
export function isPlanPlaceable(def: FurnitureDef): boolean {
  return !def.windowBound
}

/** Validity of the plan ghost at its current world point — false outright for
 *  an excluded (window-bound) def, else the same `canPlace` rule every other
 *  plan-space transform (move/rotate/scale) already validates against. */
export function planGhostValid(
  ghostItem: FurnitureItem,
  def: FurnitureDef,
  ctx: PlanGhostContext,
): boolean {
  if (!isPlanPlaceable(def)) return false
  return canPlace(ghostItem, def, ctx)
}

export type PlanCommitDecision = 'commit' | 'invalid' | 'ineligible'

/** What a commit click should do with the currently-armed def: `'ineligible'`
 *  (window-bound, excluded from Phase 1 — the caller shows a toast and
 *  disarms), `'invalid'` (red ghost — collision, click is swallowed and stays
 *  armed), or `'commit'` (green ghost — place it). */
export function decidePlanCommit(def: FurnitureDef, valid: boolean): PlanCommitDecision {
  if (!isPlanPlaceable(def)) return 'ineligible'
  return valid ? 'commit' : 'invalid'
}
