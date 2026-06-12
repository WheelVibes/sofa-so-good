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
import { WALLS } from '../../apartment/constants'
import type { FurnitureItem } from '../../furniture/types'
import { useStore } from '../../state/store'
import { computeWindowModifiers } from './windowLightModifiers'
import { setWindowAttenuation, setWindowGlassTint } from './windowLightSignal'

function recompute(items: ReadonlyArray<FurnitureItem>, glassTintHex: string): void {
  const mods = computeWindowModifiers(WALLS, items, glassTintHex)
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
    recompute(s.items, s.glassTint ?? '')

    // Subscribe to changes in items or glassTint
    const unsub = useStore.subscribe((state, prev) => {
      if (state.items !== prev.items || state.glassTint !== prev.glassTint) {
        recompute(state.items, state.glassTint ?? '')
      }
    })
    return unsub
  }, [])

  return null
}
