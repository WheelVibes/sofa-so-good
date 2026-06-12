import { useSyncExternalStore } from 'react'
import { getFinishDragActive, subscribeFinishDrag } from './finishDragSignal'

/**
 * DOM overlay that renders a visible "drop target" ring over the 3D canvas
 * while a finish swatch is being dragged over it (Q31 tail).
 *
 * Implemented as a CSS overlay rather than a Three.js mesh so it:
 *  - Works under `frameloop="demand"` with no frame-invalidation at all
 *    (it's purely DOM, completely outside the R3F render loop).
 *  - Leaves zero residue: when the drag ends, React removes the ring class
 *    synchronously on the next React flush — no stale Three.js material to
 *    clean up.
 *  - Uses only CSS custom-property tokens (`--accent`, `--accent-soft`) so
 *    it adapts to all 5 themes in light + dark automatically.
 *
 * Mount once in App.tsx as a sibling of the <Scene>/<RoomEditorScene> div.
 * The `pointer-events-none` class is crucial — the overlay must not absorb
 * the native DragEvents that `FinishDropSurface` handles on the canvas.
 */
export function FinishDragOverlay() {
  const active = useSyncExternalStore(subscribeFinishDrag, getFinishDragActive)

  if (!active) return null

  return (
    <div
      aria-hidden
      className="finish-drag-overlay pointer-events-none absolute inset-0 z-10"
      style={{
        boxShadow: 'inset 0 0 0 3px var(--accent)',
        background: 'var(--accent-soft)',
      }}
    />
  )
}
