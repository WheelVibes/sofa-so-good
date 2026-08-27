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

/**
 * Quantisation step for the number of rendered light SLOTS (LIGHT-COUNT-STABLE).
 *
 * three bakes the light COUNT into every lit material's program cache key, so
 * changing how many point/spot lights are in the scene recompiles every lit
 * material. The fixture-light set is re-picked whenever the camera moves past a
 * threshold (`FurnitureLights`), so a ±1 change in the live set — completely
 * routine while orbiting — silently triggers a full recompile.
 *
 * Measured on a Mac mini M4 at Maximum: the first frame of the first camera
 * gesture cost **204–214 ms and compiled +29 programs**, and diffing the program
 * cache keys showed all 29 differing in exactly ONE field, `18 -> 19` — a light
 * count incrementing by one (`scripts/dev-probes/frame-spikes.mjs`). Steady-state
 * cost either side of that frame is ~11 ms, so this single stall was the whole
 * defect.
 *
 * The fix is to render a QUANTISED number of slots and pad the unused ones with
 * zero-intensity lights (three counts a light regardless of its intensity — see
 * `WebGLLights.setup`, which increments `pointLength` unconditionally). Rounding
 * up to a multiple of this step means the common ±1 wobble no longer crosses a
 * program boundary.
 *
 * 4 is a deliberate middle: padding all the way to the tier budget (up to 36
 * slots in orbit at Maximum) would make the count perfectly stable but force the
 * shader to evaluate every slot per fragment for the whole session — trading a
 * one-off 200 ms compile for a permanent per-frame cost, which is the wrong way
 * round. A step of 4 costs at most 3 unused lights.
 */
export const LIGHT_SLOT_STEP = 4

/**
 * How many light slots to render for `activeCount` live emitters, rounded up to
 * {@link LIGHT_SLOT_STEP} and never above `budget` (the tier's cap, which is
 * itself a program-boundary the user only crosses on a tier change — already
 * behind a loading overlay).
 *
 * Returns 0 for 0, so a scene with no emitters still renders no lights at all
 * rather than four dead ones.
 */
export function lightSlotCount(activeCount: number, budget: number): number {
  if (!Number.isFinite(activeCount) || activeCount <= 0) return 0
  const cap = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : activeCount
  const rounded = Math.ceil(activeCount / LIGHT_SLOT_STEP) * LIGHT_SLOT_STEP
  return Math.min(Math.max(activeCount, rounded), Math.max(activeCount, cap))
}
