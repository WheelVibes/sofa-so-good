import { useStore } from '../state/store'

/**
 * Small themed pill shown while the tape measure is active, switching between
 * point-to-point **Line** distance and **Area** (rectangle) modes. A DOM
 * overlay (not in-canvas) so it works identically on desktop + touch; sits
 * bottom-centre, just above the canvas, clear of the toolbar.
 */
export function TapeModeToggle() {
  const tapeMode = useStore((s) => s.tapeMode)
  const tapeShape = useStore((s) => s.tapeShape)
  const setTapeShape = useStore((s) => s.setTapeShape)
  if (!tapeMode) return null
  return (
    <div className="pointer-events-auto absolute bottom-20 left-1/2 z-20 -translate-x-1/2">
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
    </div>
  )
}
