/**
 * CurtainLightController.tsx
 *
 * Store subscriber that recomputes window-light modifiers whenever the item
 * list changes and writes them to the module-level windowLightSignal.
 *
 * Demand-mode compatible: RenderPump already calls invalidate() on any store
 * change, so no extra invalidate() call is needed here. Zero per-frame work
 * at rest — the computation happens once per items/tint change.
 *
 * Tier gating: Performance tier = no shadow maps, but colour modulation is
 * essentially free (a couple of scalar multiplies in Lighting.tsx), so curtain
 * attenuation and glass tint apply on ALL tiers.
 */

import { useEffect } from 'react'
import type { FloorPlan } from '../../floorplan/types'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { planAttenuationWalls } from './planAttenuationWalls'
import { computeWindowModifiers } from './windowLightModifiers'
import { setWindowAttenuation, setWindowGlassTint } from './windowLightSignal'

function recompute(
  plan: FloorPlan,
  viewLevelId: string,
  items: ReadonlyArray<FurnitureItem>,
  glassTintHex: string,
): void {
  // SUN-CURTAIN-PLAN: the walls come from the LOADED plan's viewed storey, not
  // from `apartment/constants.ts`. Passing the default flat's `WALLS` meant that
  // on the other eighteen templates the sun attenuation was computed against a
  // different building — and because `curtainWindowOverlap` matches by position
  // and both plans sit near the origin, that produced plausible-looking numbers
  // rather than an obvious null (a maisonette blackout curtain measured 0.878
  // against a window the plan does not contain).
  const mods = computeWindowModifiers(planAttenuationWalls(plan, viewLevelId), items, glassTintHex)
  setWindowAttenuation(mods.attenuation)
  setWindowGlassTint(mods.glassTint[0], mods.glassTint[1], mods.glassTint[2])
}

/**
 * Mount this once inside the R3F Canvas (alongside Lighting).
 * It subscribes to the items array and glassTint preference and keeps the
 * window-light signal current.
 */
export function CurtainLightController() {
  // Read initial values and set signal on mount
  useEffect(() => {
    const s = useStore.getState()
    recompute(s.floorPlan, s.viewLevelId, s.items, s.glassTint ?? '')

    // Subscribe to changes in items, glassTint, the PLAN or the viewed storey —
    // the last two matter now that the walls are plan-derived: a plan swap or a
    // level change must re-derive the windows, or the factor stays stuck on the
    // previous apartment's.
    const unsub = useStore.subscribe((state, prev) => {
      if (
        state.items !== prev.items ||
        state.glassTint !== prev.glassTint ||
        state.floorPlan !== prev.floorPlan ||
        state.viewLevelId !== prev.viewLevelId
      ) {
        recompute(state.floorPlan, state.viewLevelId, state.items, state.glassTint ?? '')
      }
    })
    return unsub
  }, [])

  return null
}
