import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'

/**
 * Small themed pill shown while the tape measure is active, switching between
 * point-to-point **Line** distance and **Area** (rectangle) modes. A DOM
 * overlay (not in-canvas) so it works identically on desktop + touch; sits
 * bottom-centre, just above the canvas, clear of the toolbar. Gated by the
 * `measure` feature so it can't linger if the tool is disabled mid-session.
 */
export function TapeModeToggle() {
  const measureOn = useFeature('measure')
  const tapeMode = useStore((s) => s.tapeMode)
  const tapeShape = useStore((s) => s.tapeShape)
  const setTapeShape = useStore((s) => s.setTapeShape)
  const pinnedCount = useStore((s) => s.annotations.length)
  const clearAnnotations = useStore((s) => s.clearAnnotations)
  if (!measureOn || !tapeMode) return null
  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
      <div className="seg accent" style={{ display: 'flex' }}>
        {(['line', 'rect'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTapeShape(s)}
            className={tapeShape === s ? 'on' : ''}
          >
            {s === 'line' ? 'Distance' : 'Area'}
          </button>
        ))}
      </div>
      {pinnedCount > 0 ? (
        <button
          type="button"
          className="btn btn-soft btn-sm"
          title="Remove all pinned dimensions"
          onClick={() => clearAnnotations()}
        >
          Clear pins ({pinnedCount})
        </button>
      ) : null}
    </div>
  )
}
