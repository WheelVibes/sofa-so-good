import { useRef, useState } from 'react'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'

/** Pixels of vertical travel that count as a deliberate swipe (not a tap). */
const SWIPE_PX = 36

/**
 * Touch handlers for a bottom-sheet's drag handle / header: swiping **down**
 * collapses (minimizes) the panel, swiping **up** expands it. Returns no-op
 * handlers on desktop (the handle is mobile-only). A short press that doesn't
 * travel far is left alone so taps on header buttons still work.
 */
export function useSwipeToCollapse(
  minimized: boolean,
  toggle: () => void,
): {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
} {
  const isMobile = useIsMobile()
  const startY = useRef<number | null>(null)
  if (!isMobile) return { onTouchStart: () => {}, onTouchEnd: () => {} }
  return {
    onTouchStart: (e) => {
      startY.current = e.touches[0]?.clientY ?? null
    },
    onTouchEnd: (e) => {
      const y0 = startY.current
      startY.current = null
      if (y0 == null) return
      const dy = (e.changedTouches[0]?.clientY ?? y0) - y0
      // Swipe down → collapse (only if open); swipe up → expand (only if closed).
      if (dy > SWIPE_PX && !minimized) toggle()
      else if (dy < -SWIPE_PX && minimized) toggle()
    },
  }
}

/**
 * Minimize state for the inspector. The user can collapse it to just its header
 * (so it stops blocking the furniture, especially on mobile), and it
 * *auto-minimizes* while a move/rotate gesture is in progress so the piece is
 * visible as it's manipulated — restoring to the user's chosen state afterwards.
 *
 * Default state is viewport-aware: the inspector starts **expanded on desktop**
 * (where there's room beside the scene) and **minimized on mobile** (where it
 * would otherwise cover the furniture as a bottom sheet).
 */
export function useInspectorMinimize(itemId?: string): {
  minimized: boolean
  toggle: () => void
  manual: boolean
} {
  const gesturing = useStore((s) => !!s.draggingItemId || s.rotatingGizmo)
  const isMobile = useIsMobile()
  // Start expanded on desktop, minimized on mobile; track itemId so a new
  // selection resets to that viewport-appropriate default.
  const [state, setState] = useState({ id: itemId, manual: isMobile })
  if (state.id !== itemId) {
    setState({ id: itemId, manual: isMobile })
  }
  const { manual } = state
  return {
    minimized: manual || gesturing,
    toggle: () => setState((v) => ({ ...v, manual: !v.manual })),
    manual,
  }
}

/** The minimize / expand toggle shown in an inspector panel header. */
export function MinimizeButton({ minimized, toggle }: { minimized: boolean; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      className="icon-btn"
      aria-label={minimized ? 'Expand inspector' : 'Minimize inspector'}
      title={minimized ? 'Expand' : 'Minimize'}
    >
      {minimized ? <Icon.Plus width={16} height={16} /> : <Icon.Minus width={16} height={16} />}
    </button>
  )
}
