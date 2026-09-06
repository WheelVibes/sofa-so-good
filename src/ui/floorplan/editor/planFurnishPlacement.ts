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
import type { PlanOpening, PlanWall } from '../../../floorplan/types'
import { defaultItemProps } from '../../../furniture/placement/defaultItemProps'
import { doorFixtureProps, snapToNearestDoor } from '../../../furniture/placement/doorSnap'
import { snapToNearestWindow, windowFixtureProps } from '../../../furniture/placement/windowSnap'
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

/** The edited storey's window-snap inputs (PLAN-FURNISH Phase 3) — the same
 *  walls/openings/ceilingHeight triple the 3D commit reads off `floorPlan`,
 *  but scoped to the ACTIVE level (`levelAsPlan` — the plan editor edits one
 *  storey at a time, so a curtain armed on level 2 must never snap to a
 *  ground-floor window). */
export interface PlanWindowContext {
  walls: ReadonlyArray<PlanWall>
  openings: ReadonlyArray<PlanOpening>
  ceilingHeight: number
}

/** Whether the edited level has at least one window a fixture could snap to
 *  (a `window` opening whose host wall resolves) — the arming gate for a
 *  `windowBound` def in the plan. Probes `snapToNearestWindow` so "has a
 *  window" and "will snap" can never disagree. */
export function planHasWindow(
  walls: ReadonlyArray<PlanWall>,
  openings: ReadonlyArray<PlanOpening>,
): boolean {
  return snapToNearestWindow(walls, openings, [0, 0]) !== null
}

/**
 * PLAN-FURNISH Phase 3 — the window-snapped ghost/commit item for a
 * `windowBound` def (curtains, roller blinds) dropped at `worldPoint`.
 * Reuses the EXACT pure pair the 3D commit uses
 * (`furniture/placement/windowSnap.ts`): `snapToNearestWindow` picks the
 * nearest window on the edited level and the room-side facing (the wall
 * normal pointing toward the drop point), `windowFixtureProps` sizes the
 * fixture to that window (curtains wider than the glass + floor-to-ceiling,
 * blinds slightly wider with a covering drop) merged over the def defaults.
 * The user-dialed `ghostRotation` is deliberately ignored — a window fixture's
 * orientation is the window's, never the R key's (same as 3D). Returns `null`
 * when the level has no window to snap to (the caller toasts + disarms).
 */
export function buildPlanWindowGhostItem(
  def: FurnitureDef,
  worldPoint: [number, number],
  plan: PlanWindowContext,
  levelId?: string,
): FurnitureItem | null {
  const snap = snapToNearestWindow(plan.walls, plan.openings, worldPoint)
  if (!snap) return null
  return {
    id: PLAN_GHOST_ID,
    defId: def.id,
    position: snap.position,
    rotation: snap.rotation,
    props: {
      ...defaultItemProps(def),
      // CURTAIN-FLUSH: face-relative standoff off the host wall's thickness.
      ...windowFixtureProps(def.id, snap.window, plan.ceilingHeight, {
        wallThickness: snap.wallThickness,
      }),
    },
    ...(levelId ? { levelId } : {}),
  }
}

/** Whether the edited level has at least one door a fixture could snap to.
 *  Probes `snapToNearestDoor` so "has a door" and "will snap" can't disagree. */
export function planHasDoor(
  walls: ReadonlyArray<PlanWall>,
  openings: ReadonlyArray<PlanOpening>,
): boolean {
  return snapToNearestDoor(walls, openings, [0, 0]) !== null
}

/**
 * The door-snapped ghost/commit item for a `doorBound` def (pet gate, pet-door
 * insert) dropped at `worldPoint`. Reuses the EXACT pure pair the 3D commit uses
 * (`furniture/placement/doorSnap.ts`): `snapToNearestDoor` picks the nearest
 * door on the edited level and the room-side facing, `doorFixtureProps` spans
 * the fixture to that doorway. The user-dialed `ghostRotation` is ignored (a
 * door fixture's orientation is the doorway's). Returns `null` when the level has
 * no door to snap to (caller toasts + disarms). Mirrors `buildPlanWindowGhostItem`.
 */
export function buildPlanDoorGhostItem(
  def: FurnitureDef,
  worldPoint: [number, number],
  walls: ReadonlyArray<PlanWall>,
  openings: ReadonlyArray<PlanOpening>,
  levelId?: string,
): FurnitureItem | null {
  const snap = snapToNearestDoor(walls, openings, worldPoint)
  if (!snap) return null
  return {
    id: PLAN_GHOST_ID,
    defId: def.id,
    position: snap.position,
    rotation: snap.rotation,
    props: {
      ...defaultItemProps(def),
      ...doorFixtureProps(def.id, snap.door),
    },
    ...(levelId ? { levelId } : {}),
  }
}

/** Validity of a FLOOR-standing plan ghost at its current world point — the
 *  same `canPlace` rule every other plan-space transform (move/rotate/scale)
 *  already validates against. Window-bound defs never take this path (their
 *  validity is "did `buildPlanWindowGhostItem` snap", Phase 3) — a floor
 *  `canPlace` check is meaningless for a fixture that never rests on the
 *  floor, so this stays `false` as a fail-safe for any caller that forgot to
 *  branch. */
export function planGhostValid(
  ghostItem: FurnitureItem,
  def: FurnitureDef,
  ctx: PlanGhostContext,
): boolean {
  if (def.windowBound || def.doorBound) return false
  return canPlace(ghostItem, def, ctx)
}

export type PlanCommitDecision = 'commit' | 'invalid' | 'ineligible'

/** What a commit click should do with the currently-armed def: `'commit'`
 *  (green ghost — place it), `'invalid'` (red ghost — collision, click is
 *  swallowed and stays armed so the user tries another spot), or
 *  `'ineligible'` (a window-bound def with no window on the edited level —
 *  no spot can EVER commit it, so the caller toasts and disarms; Phase 3
 *  turned window-bound-with-a-window into a normal `'commit'`). A
 *  window-bound def's `valid` is snap existence (`buildPlanWindowGhostItem`
 *  returned an item), not `canPlace`. */
export function decidePlanCommit(def: FurnitureDef, valid: boolean): PlanCommitDecision {
  if (valid) return 'commit'
  return def.windowBound || def.doorBound ? 'ineligible' : 'invalid'
}

/**
 * PLAN-FURNISH Phase 2 — screen px → grid-snapped plan-space metres,
 * replicating `planPointerMapping.ts`'s `pointerGrid` arithmetic but from raw
 * client coordinates + an explicit rect/geometry bag instead of a React
 * `PointerEvent` bound to the plan `<svg>`. Needed for mobile
 * long-press-from-card: that touch's move/lift land on the catalog card
 * (native touch capture), never on the plan `<svg>`, so no React pointer
 * event carrying the SVG's own bounding rect is ever available for the
 * gesture — the caller (a window-level listener) supplies the rect + viewport
 * geometry it already tracks instead. Pure so it's unit-testable without a
 * real DOM element; the caller still applies wall/guide snapping afterwards
 * with the existing `snapToWalls`/`snapToGuides` helpers, same as the mouse/
 * tap path (`pointerWorld`).
 */
export function screenToGridPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  geom: { W: number; H: number; PX: number; gridSize: number; gridMargin: number },
): [number, number] {
  const x = ((clientX - rect.left) / rect.width) * geom.W
  const y = ((clientY - rect.top) / rect.height) * geom.H
  const snap = (m: number) =>
    geom.gridSize > 0 ? Math.round(m / geom.gridSize) * geom.gridSize : m
  return [snap(x / geom.PX - geom.gridMargin), snap(y / geom.PX - geom.gridMargin)]
}

export type PlanTouchLiftDecision = PlanCommitDecision | 'off-plan'

/**
 * The mobile long-press-drag analog of `decidePlanCommit`: a lift OFF the
 * plan `<svg>` always cancels regardless of def/validity (`'off-plan'`,
 * distinct from `'invalid'` — the caller cancels the whole placement rather
 * than leaving it armed, matching a drag-and-drop "bad drop" convention
 * instead of click-to-place's "stay armed, try again"); a lift ON the plan
 * defers to the same `decidePlanCommit` rule the tap/click path uses.
 *
 * `onPlan` must be computed via real hit-testing (`document.elementFromPoint`
 * + `svg.contains(el)`), NOT a raw bounding-rect containment check — the
 * plan `<svg>` is the scrollable CONTENT of a pannable/zoomable viewport, so
 * its `getBoundingClientRect()` can be far larger than (and offset outside)
 * the visible, clipped viewport, and other UI (the toolbar, a reopened
 * catalog sheet) can paint on top of it. A rect check would wrongly call a
 * tap on the toolbar "on-plan" whenever the SVG's raw rect happens to
 * geometrically overlap that screen point (found via the mobile visual
 * verification scenario, `plan-furnish-mobile.json`'s off-plan-cancel leg).
 */
export function decidePlanTouchLift(
  def: FurnitureDef | undefined,
  onPlan: boolean,
  valid: boolean,
): PlanTouchLiftDecision {
  if (!onPlan || !def) return 'off-plan'
  return decidePlanCommit(def, valid)
}
