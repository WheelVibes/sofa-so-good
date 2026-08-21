import { useCallback, useEffect, useRef, useState } from 'react'
import { captureCanvasPng } from '../scene/captureCanvas'
import { HDRI_PRESETS } from '../scene/lighting/hdriCatalog'
import { applyRenderPreset, RENDER_PRESETS } from '../scene/renderPresets'
import { useStore } from '../state/store'
import { CompareOverlay } from './compare/CompareOverlay'
import { Select } from './controls/Select'
import { Modal } from './Modal'
import {
  type CompareState,
  clampDivider,
  initialCompareState,
  setHdriA as pureSetHdriA,
  setHdriB as pureSetHdriB,
  setPresetA as pureSetPresetA,
  setPresetB as pureSetPresetB,
  swapAB,
} from './renderCompare/compareState'

// Milliseconds to let the live raster scene re-render with the freshly-applied
// preset (sun time / tone / exposure / fixture lights all settle on the next few
// demand-loop frames) before we read the canvas back. A render preset is a set
// of RASTER levers, so a quick raster capture is faithful — and, unlike the old
// dual path-trace, it's near-instant and can never lock up the browser.
const SETTLE_MS = 380

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Apply a preset (and an optional HDRI environment) to the live store, let the
 *  raster scene settle, capture the current frame as a PNG, then restore the
 *  original store state. `hdriId === undefined` leaves the current HDRI alone;
 *  a string sets that environment; `null` forces the procedural probe (F4). */
async function capturePreset(presetId: string, hdriId?: string | null): Promise<string> {
  const preset = RENDER_PRESETS.find((p) => p.id === presetId)
  if (!preset) throw new Error(`Unknown preset: ${presetId}`)

  // Save the store state we're about to mutate.
  const st = useStore.getState()
  const prevTime = st.timeMode
  const prevManualHour = st.manualHour
  const prevTone = st.toneMapping
  const prevExposure = st.exposure
  const prevLights = st.lightsMode
  const prevHdri = st.hdriId
  const touchHdri = hdriId !== undefined

  try {
    // Apply the preset (mutates the live store — the demand loop re-renders).
    applyRenderPreset(st, preset)
    if (touchHdri) st.setHdri(hdriId ?? null)
    await wait(SETTLE_MS)
    const png = captureCanvasPng()
    if (!png) throw new Error('Open the 3D view first, then compare.')
    return png
  } finally {
    // Restore the store to its pre-capture state.
    const s = useStore.getState()
    s.setTimeMode(prevTime)
    if (prevTime === 'manual') s.setManualHour(prevManualHour)
    s.setToneMapping(prevTone)
    s.setExposure(prevExposure)
    s.setLightsMode(prevLights)
    if (touchHdri) s.setHdri(prevHdri)
  }
}

/**
 * Render preset A/B compare modal (F4 tail).
 *
 * The user picks two render presets (A = left, B = right), hits "Render both",
 * and sees an industry-standard before/after slider: a draggable vertical
 * divider that clips the two captured images so they share the same frame.
 * Both halves are pixel-aligned — no offset or stretch. Also supports touch
 * drag on mobile (the divider is a big touch target).
 *
 * Narrower viewports fall back to a vertically stacked side-by-side view
 * (the "slider" still works but shows both images above/below each other
 * so they're legible at phone width).
 */
export function RenderCompareModal() {
  const open = useStore((s) => s.renderCompareOpen)
  const setOpen = useStore((s) => s.setRenderCompareOpen)

  const [state, setState] = useState<CompareState>(initialCompareState)
  const [phaseA, setPhaseA] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const [phaseB, setPhaseB] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Divider drag state
  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setState(initialCompareState())
      setPhaseA('idle')
      setPhaseB('idle')
      setErrorMsg(null)
    }
  }, [open])

  /** Compute the divider position from a pointer/touch X within the slider. */
  const updateDividerFromX = useCallback((clientX: number) => {
    const el = sliderRef.current
    if (!el) return
    const { left, width } = el.getBoundingClientRect()
    const frac = clampDivider((clientX - left) / width)
    setState((s) => ({ ...s, divider: frac }))
  }, [])

  // Mouse drag
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

  // Touch drag (mobile parity — CLAUDE.md requires touch support)
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (t) updateDividerFromX(t.clientX)
    },
    [updateDividerFromX],
  )
  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      if (t) updateDividerFromX(t.clientX)
    },
    [updateDividerFromX],
  )

  const renderBoth = useCallback(async () => {
    setErrorMsg(null)
    setPhaseA('rendering')
    setPhaseB('idle')
    setState((s) => ({ ...s, imageA: null, imageB: null, samplesA: 0, samplesB: 0 }))

    try {
      // Capture A first (applies its preset + HDRI, grabs the frame, restores).
      const dataA = await capturePreset(state.presetA, state.hdriA)
      setState((s) => ({ ...s, imageA: dataA }))
      setPhaseA('done')
    } catch (err) {
      setPhaseA('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
      return
    }

    setPhaseB('rendering')
    try {
      // Capture B (applies its preset + HDRI, grabs the frame, restores).
      const dataB = await capturePreset(state.presetB, state.hdriB)
      setState((s) => ({ ...s, imageB: dataB }))
      setPhaseB('done')
    } catch (err) {
      setPhaseB('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
    }
  }, [state.presetA, state.presetB, state.hdriA, state.hdriB])

  const busy = phaseA === 'rendering' || phaseB === 'rendering'
  const hasBothImages = state.imageA !== null && state.imageB !== null
  const dividerPct = `${(state.divider * 100).toFixed(1)}%`

  const presetOptions = RENDER_PRESETS.map((p) => ({ value: p.id, label: p.label }))
  // HDRI environment options for each slot — '' = the procedural probe (F4).
  const hdriOptions = [
    { value: '', label: 'Procedural' },
    ...HDRI_PRESETS.map((h) => ({ value: h.id, label: h.name })),
  ]

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Render compare"
      sub="A/B comparison — preset + environment per side, same camera view"
      width="var(--modal-lg)"
      panelId="render-compare"
      footer={
        <div className="panel-foot cmp-controls">
          {/* Preset selectors */}
          <div className="cmp-pickers">
            <label className="panel-sub plain">
              <span className="cmp-slot a" aria-hidden />
              A
              <Select
                className="input"
                ariaLabel="Preset A"
                value={state.presetA}
                disabled={busy}
                onChange={(v) => setState((s) => pureSetPresetA(s, v))}
                options={presetOptions}
              />
              <Select
                className="input"
                ariaLabel="Environment A"
                value={state.hdriA ?? ''}
                disabled={busy}
                onChange={(v) => setState((s) => pureSetHdriA(s, v === '' ? null : v))}
                options={hdriOptions}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm cmp-swap"
              aria-label="Swap presets A and B"
              title="Swap A and B"
              disabled={busy}
              onClick={() => setState(swapAB)}
            >
              ⇄
            </button>
            <label className="panel-sub plain">
              <span className="cmp-slot b" aria-hidden />
              B
              <Select
                className="input"
                ariaLabel="Preset B"
                value={state.presetB}
                disabled={busy}
                onChange={(v) => setState((s) => pureSetPresetB(s, v))}
                options={presetOptions}
              />
              <Select
                className="input"
                ariaLabel="Environment B"
                value={state.hdriB ?? ''}
                disabled={busy}
                onChange={(v) => setState((s) => pureSetHdriB(s, v === '' ? null : v))}
                options={hdriOptions}
              />
            </label>
          </div>
          {/* Actions */}
          <button type="button" className="btn btn-accent" onClick={renderBoth} disabled={busy}>
            {hasBothImages ? 'Re-render' : 'Render both'}
          </button>
        </div>
      }
    >
      {/* Main comparison area */}
      <div
        ref={sliderRef}
        role="presentation"
        aria-label="Render comparison slider — drag to compare"
        className="cmp-frame"
        style={{ cursor: busy ? 'wait' : hasBothImages ? 'ew-resize' : 'default' }}
        onMouseDown={hasBothImages ? onMouseDown : undefined}
        onTouchStart={hasBothImages ? onTouchStart : undefined}
        onTouchMove={hasBothImages ? onTouchMove : undefined}
      >
        {/* Side B — full width image shown first (behind A's clip) */}
        {state.imageB ? (
          <img
            src={state.imageB}
            alt="Preset B render"
            className="cmp-layer cmp-img"
            draggable={false}
          />
        ) : null}

        {/* Side A — clipped to the left of the divider */}
        {state.imageA ? (
          <div
            className="cmp-layer"
            style={{ clipPath: `inset(0 ${(1 - state.divider) * 100}% 0 0)` }}
          >
            <img src={state.imageA} alt="Preset A render" className="cmp-img" draggable={false} />
          </div>
        ) : null}

        {/* Split-reveal divider + corner labels (only when both images are loaded) */}
        {hasBothImages ? (
          <CompareOverlay
            dividerPct={dividerPct}
            labelA={`A · ${RENDER_PRESETS.find((p) => p.id === state.presetA)?.label ?? state.presetA}`}
            labelB={`B · ${RENDER_PRESETS.find((p) => p.id === state.presetB)?.label ?? state.presetB}`}
          />
        ) : null}

        {/* Empty / in-progress overlay — only while NOTHING is captured yet (or
            on error). Once side A is rendered, a centered message would overlap
            the image and read as clipped text, so progress for B falls to the
            status line below instead. */}
        {errorMsg || (!state.imageA && !state.imageB) ? (
          <div className="panel-sub plain cmp-empty col">
            {errorMsg ? (
              <span className="form-err">{errorMsg}</span>
            ) : phaseA === 'rendering' ? (
              'Capturing A…'
            ) : (
              'Pick two presets and click "Render both" to compare them side-by-side.'
            )}
          </div>
        ) : null}
      </div>

      {/* Status line */}
      <div className="panel-sub plain cmp-status" aria-live="polite">
        {phaseA === 'rendering'
          ? 'Capturing A…'
          : phaseB === 'rendering'
            ? 'Capturing B…'
            : hasBothImages
              ? 'Drag the divider to compare. Click "Re-render" to update.'
              : ' '}
      </div>
    </Modal>
  )
}
