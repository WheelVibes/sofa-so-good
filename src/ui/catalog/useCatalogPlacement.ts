import { useRef } from 'react'
import type { FurnitureDef } from '../../furniture/types'
import { useStore } from '../../state/store'
import { useIsMobile } from '../useIsMobile'
import { usePlacementDrag } from './usePlacementDrag'

/** How long a stationary press must last to count as a "pick it up" long-press. */
const LONG_PRESS_MS = 420
/** Finger travel that cancels a pending long-press (it's a scroll, not a hold). */
const LONG_PRESS_MOVE_PX = 12

export interface CatalogPlacement {
  /** Desktop arms placement (ghost follows the cursor); mobile runs the
   *  explicit-confirm / plan tap-to-place grammar. Swallows the trailing tap
   *  after a long-press so it doesn't toggle placement back off. */
  handleClick: (e?: React.MouseEvent) => void
  /** Raw arm handler (desktop click-to-place + keyboard Enter/Space). */
  arm: (e?: React.MouseEvent) => void
  /** Touch handlers for the mobile "pick it up" long-press. Spread onto the
   *  card/chip element (`{...touch}`). */
  touch: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
    onTouchCancel: () => void
  }
}

/**
 * Shared catalog placement interaction — the click / long-press / tap-to-place
 * grammar used to place a {@link FurnitureDef} from a catalog surface. Extracted
 * from `CatalogCard` so the compact "Recent" quick-add strip (and any future
 * card variant) reuses the EXACT same place path — desktop click-to-arm + native
 * drag, mobile explicit-confirm (`placeConfirm`) and 2D-plan tap-to-place — rather
 * than re-implementing it and drifting.
 */
export function useCatalogPlacement(def: FurnitureDef): CatalogPlacement {
  const arm = usePlacementDrag(def)
  const isMobile = useIsMobile()
  // Mobile long-press = "pick this up": arm placement, hide the catalog so the
  // room is visible, and let the ghost follow the finger to be placed with the
  // tick/cross confirmation (the catalog reappears once the placement resolves).
  const press = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null)
  const startLongPress = (e: React.TouchEvent) => {
    if (!isMobile) return
    const t = e.touches[0]
    if (!t) return
    const x = t.clientX
    const y = t.clientY
    const timer = window.setTimeout(() => {
      if (press.current) press.current.fired = true
      const s = useStore.getState()
      // PLAN-FURNISH Phase 2 — inside the 2D plan editor the card arms the
      // PLAN placement grammar instead: arm + auto-close the sheet so the plan
      // is visible (cancel is the path back to the catalog), then either drag
      // this same touch onto the plan (FloorPlanEditor's window-level
      // long-press effect drives the ghost and commits on lift) or lift and
      // tap the plan (tap-to-place). No `placeConfirm`/`cursor` — those drive
      // the 3D canvas ghost, which is inert behind the plan overlay.
      if (s.floorPlanEditing) {
        s.setReopenCatalogAfterPlace(true)
        s.setActiveDefId(def.id)
        s.setCatalogOpen(false)
        return
      }
      // Explicit-confirm placement (bugs #2/#5): arm the ghost at the finger,
      // close the catalog, and show the "Place item?" pill. The ghost then
      // follows the finger and stays freely draggable — a lift never commits or
      // aborts — until the user taps ✓/✗. We do NOT snap the camera (requestTopView
      // was removed): a camera move mid-drag read as "the canvas moving on me".
      s.setReopenCatalogAfterPlace(true)
      s.setActiveDefId(def.id)
      s.setPlaceConfirm(true)
      s.setCursor({ x, y })
      s.setCatalogOpen(false)
    }, LONG_PRESS_MS)
    press.current = { x, y, timer, fired: false }
  }
  const moveLongPress = (e: React.TouchEvent) => {
    const p = press.current
    if (!p || p.fired) return
    const t = e.touches[0]
    if (!t) return
    if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > LONG_PRESS_MOVE_PX) {
      window.clearTimeout(p.timer)
      press.current = null
    }
  }
  const endLongPress = () => {
    const p = press.current
    if (p && !p.fired) window.clearTimeout(p.timer)
    // Keep `fired` readable by the click handler that follows; clear it next tick.
    if (p?.fired) window.setTimeout(() => (press.current = null), 0)
    else press.current = null
  }
  const handleClick = (e?: React.MouseEvent) => {
    // A long-press already armed placement — swallow the trailing tap so it
    // doesn't toggle placement back off.
    if (press.current?.fired) return
    if (isMobile) {
      const s = useStore.getState()
      // Tapping the same armed card again toggles the placement off (both the
      // 3D placeConfirm flow and the plan tap-to-place flow).
      if (s.activeDefId === def.id && (s.placeConfirm || s.floorPlanEditing)) {
        s.cancelPlacement()
        return
      }
      // PLAN-FURNISH Phase 2 — inside the 2D plan editor a tap arms the PLAN
      // tap-to-place grammar: arm + auto-close the sheet so the plan is
      // visible, then a tap on the plan SVG commits at that spot (the same
      // `onDown` branch desktop click-to-place uses; the pendingEdit ✓/✗ bar
      // follows). Cancel is the path back to the catalog
      // (`reopenCatalogAfterPlace`). No `placeConfirm`/`cursor` — those drive
      // the 3D canvas ghost, which is inert behind the plan overlay.
      if (s.floorPlanEditing) {
        s.setReopenCatalogAfterPlace(true)
        s.setActiveDefId(def.id)
        s.setCatalogOpen(false)
        return
      }
      // Bug #5: a plain tap closes the catalog and drops the ghost hovering at
      // the canvas centre with the "Place item?" pill, freely draggable until
      // ✓/✗ (same explicit-confirm flow as the long-press, just centred).
      s.setReopenCatalogAfterPlace(true)
      s.setActiveDefId(def.id)
      s.setPlaceConfirm(true)
      s.setCursor({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      s.setCatalogOpen(false)
      return
    }
    arm(e)
  }
  return {
    handleClick,
    arm,
    touch: {
      onTouchStart: startLongPress,
      onTouchMove: moveLongPress,
      onTouchEnd: endLongPress,
      onTouchCancel: endLongPress,
    },
  }
}
