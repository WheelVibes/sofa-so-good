import { useCallback, useEffect, useRef, useState } from 'react'
import { captureCanvasPng } from '../scene/captureCanvas'
import { useStore } from '../state/store'
import { CompareOverlay } from './compare/CompareOverlay'
import { Modal } from './Modal'
import { clampDivider } from './renderCompare/compareState'
import { captureStagingPair } from './staging/stagingReveal'

/**
 * Before/after staging reveal modal.
 *
 * Captures the room twice from the SAME camera — once empty (all furniture
 * transiently hidden) and once furnished (the current design) — and presents an
 * industry-standard reveal slider: a draggable vertical divider clipping the two
 * pixel-aligned frames. The "wow, look what furnishing did" comparison that
 * consumer staging apps (Decor8 / Havenly / ReimagineHome) lead with.
 *
 * Capture orchestration + the hidden-set juggling live in the pure, unit-tested
 * `staging/stagingReveal.ts`; this component owns only React state + the drag UI.
 * Touch drag is supported for mobile parity (CLAUDE.md).
 */
export function StagingRevealModal() {
  const open = useStore((s) => s.stagingRevealOpen)
  const setOpen = useStore((s) => s.setStagingRevealOpen)

  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [divider, setDivider] = useState(0.5)
  const [phase, setPhase] = useState<'idle' | 'capturing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setBefore(null)
      setAfter(null)
      setDivider(0.5)
      setPhase('idle')
      setErrorMsg(null)
    }
  }, [open])

  const updateDividerFromX = useCallback((clientX: number) => {
    const el = sliderRef.current
    if (!el) return
    const { left, width } = el.getBoundingClientRect()
    setDivider(clampDivider((clientX - left) / width))
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true
      updateDividerFromX(e.clientX)
    },
    [updateDividerFromX],
  )
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) updateDividerFromX(e.clientX)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [updateDividerFromX])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (t) updateDividerFromX(t.clientX)
    },
    [updateDividerFromX],
  )

  const capture = useCallback(async () => {
    setErrorMsg(null)
    setPhase('capturing')
    setBefore(null)
    setAfter(null)
    try {
      const pair = await captureStagingPair({
        getHiddenIds: () => useStore.getState().hiddenItemIds,
        getAllItemIds: () => useStore.getState().items.map((i) => i.id),
        // Restore the exact prior hidden set (transient/visual, not persisted).
        setHiddenIds: (ids) => useStore.setState({ hiddenItemIds: ids }),
        setItemsHidden: (ids, hidden) => useStore.getState().setItemsHidden(ids, hidden),
        capture: captureCanvasPng,
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      })
      setBefore(pair.before)
      setAfter(pair.after)
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
    }
  }, [])

  const hasBoth = before !== null && after !== null
  const dividerPct = `${(divider * 100).toFixed(1)}%`

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Before / after"
      sub="Reveal slider — empty room vs your furnished design, same camera"
      width="var(--modal-lg)"
      panelId="staging-reveal"
      footer={
        <div className="panel-foot">
          <button
            type="button"
            className="btn btn-accent"
            onClick={capture}
            disabled={phase === 'capturing'}
          >
            {phase === 'capturing' ? 'Capturing…' : hasBoth ? 'Re-capture' : 'Capture reveal'}
          </button>
        </div>
      }
    >
      <div
        ref={sliderRef}
        role="presentation"
        aria-label="Staging reveal slider — drag to compare empty vs furnished"
        className="cmp-frame"
        style={{ cursor: phase === 'capturing' ? 'wait' : hasBoth ? 'ew-resize' : 'default' }}
        onMouseDown={hasBoth ? onMouseDown : undefined}
        onTouchStart={hasBoth ? onTouchMove : undefined}
        onTouchMove={hasBoth ? onTouchMove : undefined}
      >
        {/* After (furnished) — full width behind. */}
        {after ? (
          <img src={after} alt="Furnished design" className="cmp-layer cmp-img" draggable={false} />
        ) : null}

        {/* Before (empty room) — clipped to the left of the divider. */}
        {before ? (
          <div className="cmp-layer" style={{ clipPath: `inset(0 ${(1 - divider) * 100}% 0 0)` }}>
            <img src={before} alt="Empty room" className="cmp-img" draggable={false} />
          </div>
        ) : null}

        {/* Divider bar + handle + labels (only with both frames). */}
        {hasBoth ? (
          <CompareOverlay
            dividerPct={dividerPct}
            labelA="Before · Empty"
            labelB="After · Furnished"
          />
        ) : null}

        {/* Empty / progress / error overlay (before any capture). */}
        {errorMsg || !hasBoth ? (
          <div className="panel-sub plain cmp-empty">
            {errorMsg ? (
              <span className="form-err">{errorMsg}</span>
            ) : phase === 'capturing' ? (
              'Capturing the empty room and your design…'
            ) : (
              'Click "Capture reveal" to compare the empty room with your furnished design.'
            )}
          </div>
        ) : null}
      </div>

      <div className="panel-sub plain cmp-status" aria-live="polite">
        {phase === 'capturing'
          ? 'Capturing…'
          : hasBoth
            ? 'Drag the divider to reveal. Click "Re-capture" to refresh after edits.'
            : ' '}
      </div>
    </Modal>
  )
}
