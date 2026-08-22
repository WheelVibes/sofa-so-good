import { useCallback, useEffect, useRef, useState } from 'react'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import { captureCanvasPng } from '../scene/captureCanvas'
import { applySerialized } from '../state/schema'
import { storage } from '../state/storage/adapter'
import { pauseAutosave, resumeAutosave } from '../state/storage/autosave'
import { useStore } from '../state/store'
import { CompareOverlay } from './compare/CompareOverlay'
import { Modal } from './Modal'
import { clampDivider } from './renderCompare/compareState'
import { captureVersionComparePair } from './versionCompare/versionCompare'

/**
 * Live 3D version split-view compare (sibling of `versions`).
 *
 * Captures the current design from the live 3D view, then temporarily swaps
 * the chosen SAVED version's design into the same store (items/floor plan/
 * finishes/palette), captures that too, and restores the exact prior design —
 * then presents both frames on the same draggable reveal-divider mechanism
 * as `RenderCompareModal`/`StagingRevealModal`. Image-based rather than a
 * live dual-scene render (see `versionCompare/versionCompare.ts` for why);
 * the swap-capture-restore orchestration lives there, fully unit-tested —
 * this component owns only React state + the drag UI.
 *
 * Safety: the swap runs through `withTemporaryDesign` (via
 * `captureVersionComparePair`), which suppresses undo history for both the
 * swap-in and the restore and pauses autosave for the whole window, so a
 * saved version's design can never leak into the undo stack or the autosave
 * slot — however long the capture takes. Because this modal stays mounted
 * for the whole session, `captureVersionComparePair` also no-ops (resolves
 * `null`) if a capture is already in flight, so reopening it against another
 * version can't start a second overlapping swap; `capture()` treats `null` as
 * "no-op", not an error, and unwedges `phase` back to `'idle'`.
 */
export function VersionCompareModal() {
  const open = useStore((s) => s.versionCompareOpen)
  const slot = useStore((s) => s.versionCompareSlot)
  const setVersionCompare = useStore((s) => s.setVersionCompare)

  const [current, setCurrent] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [divider, setDivider] = useState(0.5)
  const [phase, setPhase] = useState<'idle' | 'capturing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    if (!open) {
      setCurrent(null)
      setSaved(null)
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
    if (!slot) return
    setErrorMsg(null)
    setPhase('capturing')
    setCurrent(null)
    setSaved(null)
    try {
      const data = await storage.load(slot)
      if (!data) throw new Error(`Couldn't load version "${slot}".`)
      const pair = await captureVersionComparePair({
        getSavedPatch: () => {
          const st = useStore.getState()
          const userIds = st.userFurniture.map((d) => d.id)
          const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds])
          return applySerialized(data, known)
        },
        temporary: {
          pick: (keys) => {
            const st = useStore.getState() as unknown as Record<string, unknown>
            return Object.fromEntries(keys.map((k) => [k, st[k]]))
          },
          apply: (patch) => useStore.setState(patch as never),
          runWithoutHistory: (fn) => useStore.getState().runWithoutHistory(fn),
          pauseAutosave,
          resumeAutosave,
        },
        capture: captureCanvasPng,
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      })
      if (!pair) {
        // Another capture was already in flight (VERSION-COMPARE-VIEW overlap
        // guard) — no-op rather than wedging `phase` at 'capturing' forever.
        setPhase((p) => (p === 'capturing' ? 'idle' : p))
        return
      }
      setCurrent(pair.current)
      setSaved(pair.saved)
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
    }
  }, [slot])

  const hasBoth = current !== null && saved !== null
  const dividerPct = `${(divider * 100).toFixed(1)}%`

  return (
    <Modal
      open={open}
      onClose={() => setVersionCompare(null)}
      title="Compare in 3D"
      sub={slot ? `Reveal slider — current design vs “${slot}”, same camera` : undefined}
      width="var(--modal-lg)"
      panelId="version-compare"
      footer={
        <div className="panel-foot">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void capture()}
            disabled={phase === 'capturing'}
          >
            {phase === 'capturing' ? 'Capturing…' : hasBoth ? 'Re-capture' : 'Capture compare'}
          </button>
        </div>
      }
    >
      <div
        ref={sliderRef}
        role="presentation"
        aria-label="Version compare slider — drag to compare current vs saved"
        className="cmp-frame"
        style={{ cursor: phase === 'capturing' ? 'wait' : hasBoth ? 'ew-resize' : 'default' }}
        onMouseDown={hasBoth ? onMouseDown : undefined}
        onTouchStart={hasBoth ? onTouchMove : undefined}
        onTouchMove={hasBoth ? onTouchMove : undefined}
      >
        {/* Saved version — full width behind. */}
        {saved ? (
          <img src={saved} alt="Saved version" className="cmp-layer cmp-img" draggable={false} />
        ) : null}

        {/* Current design — clipped to the left of the divider. */}
        {current ? (
          <div className="cmp-layer" style={{ clipPath: `inset(0 ${(1 - divider) * 100}% 0 0)` }}>
            <img src={current} alt="Current design" className="cmp-img" draggable={false} />
          </div>
        ) : null}

        {hasBoth ? (
          <CompareOverlay
            dividerPct={dividerPct}
            labelA="Current"
            labelB={slot ?? 'Saved version'}
          />
        ) : null}

        {errorMsg || !hasBoth ? (
          <div className="panel-sub plain cmp-empty">
            {errorMsg ? (
              <span className="form-err">{errorMsg}</span>
            ) : phase === 'capturing' ? (
              'Capturing the current design and the saved version…'
            ) : (
              'Click "Capture compare" to compare the current design with this saved version.'
            )}
          </div>
        ) : null}
      </div>

      <div className="panel-sub plain cmp-status" aria-live="polite">
        {phase === 'capturing'
          ? 'Capturing…'
          : hasBoth
            ? 'Drag the divider to compare. Click "Re-capture" to refresh after edits.'
            : ' '}
      </div>
    </Modal>
  )
}
