import { useCallback, useEffect, useRef, useState } from 'react'
import type { HqRenderSession } from '../scene/pathtrace/hqRenderSession'
import { getHqRenderSource } from '../scene/pathtrace/hqRenderSource'
import { applyRenderPreset, RENDER_PRESETS } from '../scene/renderPresets'
import { useStore } from '../state/store'
import { Modal } from './Modal'
import {
  type CompareState,
  clampDivider,
  initialCompareState,
  setPresetA as pureSetPresetA,
  setPresetB as pureSetPresetB,
  swapAB,
} from './renderCompare/compareState'

const SAMPLE_STEPS = [32, 64, 128, 256] as const

// Use a tiny resolution in dev so the headless harness can exercise the full
// pipeline in seconds; real GPUs use 720p for a quick comparison render.
const DEV_RENDER_SIZE = { w: 192, h: 108 }
const PROD_RENDER_SIZE = { w: 1280, h: 720 }

function renderSize() {
  return import.meta.env.DEV ? DEV_RENDER_SIZE : PROD_RENDER_SIZE
}

/** Apply a preset to the store, take a snapshot render, then restore the
 *  original store state. Returns a data-URL PNG on success. */
async function capturePreset(
  presetId: string,
  maxSamples: number,
  onProgress: (n: number) => void,
): Promise<string> {
  const preset = RENDER_PRESETS.find((p) => p.id === presetId)
  if (!preset) throw new Error(`Unknown preset: ${presetId}`)

  const src = getHqRenderSource()
  if (!src) throw new Error('No render source — open the 3D view first')

  // Save the store state we're about to mutate.
  const st = useStore.getState()
  const prevTime = st.timeMode
  const prevManualHour = st.manualHour
  const prevTone = st.toneMapping
  const prevExposure = st.exposure
  const prevLights = st.lightsMode

  // Apply the preset (mutates live store — the live view changes briefly).
  applyRenderPreset(st, preset)

  const { w, h } = renderSize()
  const { createHqRenderSession } = await import('../scene/pathtrace/hqRenderSession')
  let session: HqRenderSession | null = null
  try {
    session = await createHqRenderSession(src.scene, src.camera, {
      width: w,
      height: h,
      maxSamples,
      onProgress: (n) => onProgress(n),
    })
    // Accumulate samples via polling — the session uses rAF internally.
    // We poll every 100 ms and resolve when enough samples have accumulated,
    // or after a 10 s safety timeout so we never hang the modal.
    await new Promise<void>((resolve) => {
      const s = session!
      s.start()
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearInterval(poll)
        clearTimeout(safety)
        resolve()
      }
      const poll = setInterval(() => {
        if (s.samples >= maxSamples) finish()
      }, 100)
      const safety = setTimeout(finish, 10_000)
    })
    return session.toDataURL()
  } finally {
    session?.dispose()
    // Restore the store to its pre-capture state.
    const s = useStore.getState()
    s.setTimeMode(prevTime)
    if (prevTime === 'manual') s.setManualHour(prevManualHour)
    s.setToneMapping(prevTone)
    s.setExposure(prevExposure)
    s.setLightsMode(prevLights)
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
  const [maxSamples, setMaxSamples] = useState<number>(64)
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
      // Render A first (applies its preset, captures, restores store).
      const dataA = await capturePreset(state.presetA, maxSamples, (n) =>
        setState((s) => ({ ...s, samplesA: n })),
      )
      setState((s) => ({ ...s, imageA: dataA }))
      setPhaseA('done')
    } catch (err) {
      setPhaseA('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
      return
    }

    setPhaseB('rendering')
    try {
      // Render B (applies its preset, captures, restores store).
      const dataB = await capturePreset(state.presetB, maxSamples, (n) =>
        setState((s) => ({ ...s, samplesB: n })),
      )
      setState((s) => ({ ...s, imageB: dataB }))
      setPhaseB('done')
    } catch (err) {
      setPhaseB('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
    }
  }, [state.presetA, state.presetB, maxSamples])

  const busy = phaseA === 'rendering' || phaseB === 'rendering'
  const hasBothImages = state.imageA !== null && state.imageB !== null
  const dividerPct = `${(state.divider * 100).toFixed(1)}%`

  const presetOptions = RENDER_PRESETS.map((p) => (
    <option key={p.id} value={p.id}>
      {p.label}
    </option>
  ))

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Render compare"
      sub="A/B comparison — two presets, same camera view"
      width={820}
      panelId="render-compare"
      footer={
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* Preset selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label
              className="panel-sub"
              style={{ textTransform: 'none', letterSpacing: 0, display: 'flex', gap: 6 }}
            >
              <span
                className="rc-slot-badge rc-slot-a"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: 'var(--accent)',
                  alignSelf: 'center',
                }}
                aria-hidden
              />
              A
              <select
                className="input"
                aria-label="Preset A"
                value={state.presetA}
                disabled={busy}
                onChange={(e) => setState((s) => pureSetPresetA(s, e.target.value))}
              >
                {presetOptions}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-sm"
              aria-label="Swap presets A and B"
              title="Swap A and B"
              disabled={busy}
              onClick={() => setState(swapAB)}
              style={{ padding: '4px 8px', fontSize: 16 }}
            >
              ⇄
            </button>
            <label
              className="panel-sub"
              style={{ textTransform: 'none', letterSpacing: 0, display: 'flex', gap: 6 }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: 'var(--text-3)',
                  alignSelf: 'center',
                }}
                aria-hidden
              />
              B
              <select
                className="input"
                aria-label="Preset B"
                value={state.presetB}
                disabled={busy}
                onChange={(e) => setState((s) => pureSetPresetB(s, e.target.value))}
              >
                {presetOptions}
              </select>
            </label>
            <select
              className="input"
              aria-label="Render quality (samples)"
              value={maxSamples}
              disabled={busy}
              onChange={(e) => setMaxSamples(Number(e.target.value))}
            >
              {SAMPLE_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n} samples
                </option>
              ))}
            </select>
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
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: busy ? 'wait' : hasBothImages ? 'ew-resize' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onMouseDown={hasBothImages ? onMouseDown : undefined}
        onTouchStart={hasBothImages ? onTouchStart : undefined}
        onTouchMove={hasBothImages ? onTouchMove : undefined}
      >
        {/* Side B — full width image shown first (behind A's clip) */}
        {state.imageB ? (
          <img
            src={state.imageB}
            alt="Preset B render"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
            }}
            draggable={false}
          />
        ) : null}

        {/* Side A — clipped to the left of the divider */}
        {state.imageA ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(0 ${(1 - state.divider) * 100}% 0 0)`,
            }}
          >
            <img
              src={state.imageA}
              alt="Preset A render"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
              }}
              draggable={false}
            />
          </div>
        ) : null}

        {/* Divider bar + handle (only when both images are loaded) */}
        {hasBothImages ? (
          <>
            {/* Vertical bar */}
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
            {/* Drag handle circle */}
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
          </>
        ) : null}

        {/* Labels: A (left) and B (right) */}
        {hasBothImages ? (
          <>
            <div
              className="panel-sub"
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
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
              A · {RENDER_PRESETS.find((p) => p.id === state.presetA)?.label ?? state.presetA}
            </div>
            <div
              className="panel-sub"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
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
              B · {RENDER_PRESETS.find((p) => p.id === state.presetB)?.label ?? state.presetB}
            </div>
          </>
        ) : null}

        {/* Empty / in-progress overlay */}
        {!hasBothImages ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
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
              <span style={{ color: 'var(--danger, #c0392b)' }}>{errorMsg}</span>
            ) : phaseA === 'rendering' ? (
              `Rendering A (${state.samplesA} / ${maxSamples} samples)…`
            ) : phaseB === 'rendering' ? (
              `Rendering B (${state.samplesB} / ${maxSamples} samples)…`
            ) : (
              'Pick two presets and click "Render both" to compare them side-by-side.'
            )}
          </div>
        ) : null}
      </div>

      {/* Status line */}
      <div
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8, minHeight: 16 }}
        aria-live="polite"
      >
        {phaseA === 'rendering'
          ? `A: ${state.samplesA} / ${maxSamples} samples`
          : phaseB === 'rendering'
            ? `B: ${state.samplesB} / ${maxSamples} samples`
            : hasBothImages
              ? 'Drag the divider to compare. Click "Re-render" to update.'
              : ' '}
      </div>
    </Modal>
  )
}
