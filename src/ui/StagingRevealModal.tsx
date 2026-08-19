import { useCallback, useEffect, useRef, useState } from 'react'
import { captureCanvasPng } from '../scene/captureCanvas'
import { useStore } from '../state/store'
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
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
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
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: phase === 'capturing' ? 'wait' : hasBoth ? 'ew-resize' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onMouseDown={hasBoth ? onMouseDown : undefined}
        onTouchStart={hasBoth ? onTouchMove : undefined}
        onTouchMove={hasBoth ? onTouchMove : undefined}
      >
        {/* After (furnished) — full width behind. */}
        {after ? (
          <img
            src={after}
            alt="Furnished design"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
            }}
            draggable={false}
          />
        ) : null}

        {/* Before (empty room) — clipped to the left of the divider. */}
        {before ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(0 ${(1 - divider) * 100}% 0 0)`,
            }}
          >
            <img
              src={before}
              alt="Empty room"
              style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
              draggable={false}
            />
          </div>
        ) : null}

        {/* Divider bar + handle + labels (only with both frames). */}
        {hasBoth ? (
          <>
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: dividerPct,
                transform: 'translateX(-50%)',
                width: 2,
                background: 'var(--on-accent, #fff)',
                pointerEvents: 'none',
              }}
              aria-hidden
            />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: dividerPct,
                transform: 'translate(-50%, -50%)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--on-accent, #fff)',
                boxShadow: '0 1px 6px rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                fontSize: 14,
                color: 'var(--surface-solid)',
              }}
              aria-hidden
            >
              ⇄
            </div>
            <div
              className="panel-sub"
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                padding: '2px 7px',
                borderRadius: 4,
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: 11,
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              Before · Empty
            </div>
            <div
              className="panel-sub"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                padding: '2px 7px',
                borderRadius: 4,
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: 11,
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              After · Furnished
            </div>
          </>
        ) : null}

        {/* Empty / progress / error overlay (before any capture). */}
        {errorMsg || !hasBoth ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              textTransform: 'none',
              letterSpacing: 0,
              textAlign: 'center',
              padding: 24,
            }}
          >
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

      <div
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8, minHeight: 16 }}
        aria-live="polite"
      >
        {phase === 'capturing'
          ? 'Capturing…'
          : hasBoth
            ? 'Drag the divider to reveal. Click "Re-capture" to refresh after edits.'
            : ' '}
      </div>
    </Modal>
  )
}
