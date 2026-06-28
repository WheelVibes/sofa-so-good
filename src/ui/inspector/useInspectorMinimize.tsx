import { useState } from 'react'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { useIsMobile } from '../useIsMobile'

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
