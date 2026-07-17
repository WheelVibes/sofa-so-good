import { useStore } from '../state/store'

/**
 * DOM overlay ring shown over the 3D canvas while the finish eyedropper is
 * armed (UX-7) — the visible "sampling mode" cue, sibling of the drag overlay.
 *
 * Purely DOM (outside the R3F render loop) and `pointer-events-none` so it
 * never absorbs the click the eyedropper needs to raycast. Reads the armed
 * flag straight off the store (a rare, discrete toggle — unlike the per-frame
 * finish-drag signal, it needs no external-store micro-signal). Accent-token
 * styles adapt across light/dark + all 5 themes automatically.
 */
export function FinishEyedropperOverlay() {
  const armed = useStore((s) => s.eyedropperArmed)
  const sampling = useStore((s) => s.sampledFinish === null)
  if (!armed) return null
  return (
    <div
      aria-hidden
      className="finish-eyedropper-overlay pointer-events-none absolute inset-0 z-10"
      style={{
        boxShadow: 'inset 0 0 0 2px var(--accent)',
        background: sampling ? 'var(--accent-soft)' : 'transparent',
      }}
    />
  )
}
