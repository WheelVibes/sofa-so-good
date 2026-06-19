/**
 * Pure selection of which light-emitting fixtures get a real point/spot light,
 * given a per-frame budget. The renderer (`FurnitureLights`) ranks emitters by
 * squared distance to the camera, then calls this to cap the live set.
 *
 * Both view modes obey the `maxFixtureLights` quality budget (PERF-002):
 *  - **firstPerson** (walk) mode caps to the nearest `maxLights` (you only see a
 *    room at a time).
 *  - **orbit** mode caps to the nearest `maxLights * ORBIT_BUDGET_MULTIPLIER` — a
 *    higher, still-bounded budget because the whole home is visible at once, but
 *    no longer *every* emitter (a furnished night home reaches 30–50 emitters, and
 *    Three.js evaluates every non-shadow light per fragment over the framebuffer).
 *
 * The budget is tier-aware: `maxLights` itself rises with the render tier
 * (`QUALITY_PRESETS[*].maxFixtureLights`), so higher tiers automatically allow
 * more live fixtures in both modes.
 *
 * Ambient/fill lighting and emissive fixture materials are independent of this
 * cap, so capping the *live point lights* never makes the scene go dark — the
 * dropped fixtures are the farthest-from-camera ones, whose direct contribution
 * to the visible framebuffer is smallest.
 */

/** Orbit shows the whole home, so it gets a larger budget than walk — but still
 *  bounded at `maxFixtureLights * this`, instead of the old uncapped "show all". */
export const ORBIT_BUDGET_MULTIPLIER = 3

/** The view mode that drives the budget. Mirrors the store's `CameraMode`
 *  (`'orbit' | 'firstPerson'`) — `firstPerson` is the in-home walk view. */
type CameraMode = 'orbit' | 'firstPerson'

/**
 * The live-light budget for the current view mode, derived from the tier's
 * `maxFixtureLights`. Orbit gets the multiplier; walk gets the raw cap.
 */
export function fixtureLightBudget(cameraMode: CameraMode, maxLights: number): number {
  const cap = cameraMode === 'orbit' ? maxLights * ORBIT_BUDGET_MULTIPLIER : maxLights
  return Math.max(0, Math.floor(cap))
}

/**
 * Pick the budgeted subset of `ranked` (already sorted nearest-first by the
 * caller). Returns the same array unchanged when it already fits the budget
 * (no allocation / no-op), else a `slice` of the nearest N.
 */
export function chooseEmitters<T>(
  ranked: readonly T[],
  cameraMode: CameraMode,
  maxLights: number,
): readonly T[] {
  const budget = fixtureLightBudget(cameraMode, maxLights)
  return ranked.length <= budget ? ranked : ranked.slice(0, budget)
}
