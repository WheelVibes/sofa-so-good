import { useCallback, useEffect, useRef, useState } from 'react'
import { captureCanvasPng } from '../scene/captureCanvas'
import { PRESET_HOURS, type TimePreset } from '../state/slices/timeSlice'
import { useStore } from '../state/store'
import { Select } from './controls/Select'
import { Modal } from './Modal'
import { clampDivider } from './renderCompare/compareState'
import { formatClock } from './scene/TimeOfDaySlider'
import { captureTimeComparePair } from './timeCompare/timeCompare'

const TIME_PRESETS: TimePreset[] = ['morning', 'noon', 'dusk', 'night']

const TIME_PRESET_LABELS: Record<TimePreset, string> = {
  morning: 'Morning',
  noon: 'Midday',
  dusk: 'Dusk',
  night: 'Night',
}

function presetOptionLabel(p: TimePreset): string {
  return `${TIME_PRESET_LABELS[p]} · ${formatClock(PRESET_HOURS[p])}`
}

const TIME_PRESET_OPTIONS = TIME_PRESETS.map((p) => ({ value: p, label: presetOptionLabel(p) }))

// Sensible defaults (FEAT-1): midday vs night — the strongest natural-light
// contrast, and the pairing an HDB buyer cares about most ("which unit gets
// evening sun").
const DEFAULT_PRESET_A: TimePreset = 'noon'
const DEFAULT_PRESET_B: TimePreset = 'night'

/**
 * Time-of-day comparison reveal modal (FEAT-1).
 *
 * Reuses the exact reveal-slider mechanism `StagingRevealModal` established
 * (capture the SAME camera twice, composite with a draggable divider) but
 * drives the existing sun/time rig (`timeSlice` — the same presets the Scene
 * menu's "Render preset" picker uses) instead of furniture visibility, so the
 * two frames differ **only** in time of day: tone mapping, exposure, lights
 * mode and HDRI are left exactly as the user has them, in both frames.
 *
 * Capture orchestration + the time-state restore live in the pure,
 * unit-tested `timeCompare/timeCompare.ts`; this component owns only React
 * state + the drag UI (identical touch/mouse handling to the staging-reveal
 * and render-compare modals for consistency).
 */
export function TimeCompareModal() {
  const open = useStore((s) => s.timeCompareOpen)
  const setOpen = useStore((s) => s.setTimeCompareOpen)

  const [presetA, setPresetA] = useState<TimePreset>(DEFAULT_PRESET_A)
  const [presetB, setPresetB] = useState<TimePreset>(DEFAULT_PRESET_B)
  const [imageA, setImageA] = useState<string | null>(null)
  const [imageB, setImageB] = useState<string | null>(null)
  const [divider, setDivider] = useState(0.5)
  const [phase, setPhase] = useState<'idle' | 'capturing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Reset everything when the modal closes.
  useEffect(() => {
    if (!open) {
      setImageA(null)
      setImageB(null)
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
    setImageA(null)
    setImageB(null)
    try {
      const pair = await captureTimeComparePair(presetA, presetB, {
        getTimeMode: () => useStore.getState().timeMode,
        getManualHour: () => useStore.getState().manualHour,
        setPresetTime: (p) => useStore.getState().setPresetTime(p),
        setTimeMode: (m) => useStore.getState().setTimeMode(m),
        setManualHour: (h) => useStore.getState().setManualHour(h),
        capture: captureCanvasPng,
        wait: (ms) => new Promise((r) => setTimeout(r, ms)),
      })
      setImageA(pair.imageA)
      setImageB(pair.imageB)
      setPhase('done')
    } catch (err) {
      setPhase('error')
      setErrorMsg(String(err instanceof Error ? err.message : err))
    }
  }, [presetA, presetB])

  const hasBoth = imageA !== null && imageB !== null
  const dividerPct = `${(divider * 100).toFixed(1)}%`
  const busy = phase === 'capturing'

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Time-of-day compare"
      sub="Reveal slider — the same view at two times of day"
      width="var(--modal-lg)"
      panelId="time-compare"
      footer={
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--s-3)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}
          >
            <label
              className="panel-sub plain"
              style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: 'var(--accent)',
                }}
                aria-hidden
              />
              A
              <Select
                className="input"
                ariaLabel="Time preset A"
                value={presetA}
                disabled={busy}
                onChange={(v) => setPresetA(v as TimePreset)}
                options={TIME_PRESET_OPTIONS}
              />
            </label>
            <label
              className="panel-sub plain"
              style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: 'var(--text-3)',
                }}
                aria-hidden
              />
              B
              <Select
                className="input"
                ariaLabel="Time preset B"
                value={presetB}
                disabled={busy}
                onChange={(v) => setPresetB(v as TimePreset)}
                options={TIME_PRESET_OPTIONS}
              />
            </label>
          </div>
          <button type="button" className="btn btn-accent" onClick={capture} disabled={busy}>
            {busy ? 'Capturing…' : hasBoth ? 'Re-capture' : 'Capture compare'}
          </button>
        </div>
      }
    >
      <div
        ref={sliderRef}
        role="presentation"
        aria-label="Time-of-day compare slider — drag to compare"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
          cursor: busy ? 'wait' : hasBoth ? 'ew-resize' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onMouseDown={hasBoth ? onMouseDown : undefined}
        onTouchStart={hasBoth ? onTouchMove : undefined}
        onTouchMove={hasBoth ? onTouchMove : undefined}
      >
        {/* B — full width behind. */}
        {imageB ? (
          <img
            src={imageB}
            alt={`Scene at ${TIME_PRESET_LABELS[presetB]}`}
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

        {/* A — clipped to the left of the divider. */}
        {imageA ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(0 ${(1 - divider) * 100}% 0 0)`,
            }}
          >
            <img
              src={imageA}
              alt={`Scene at ${TIME_PRESET_LABELS[presetA]}`}
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
                fontSize: 'var(--t-md)',
                color: 'var(--surface-solid)',
              }}
              aria-hidden
            >
              ⇄
            </div>
            <div
              className="panel-sub plain"
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                padding: 'var(--s-1) var(--s-2)',
                borderRadius: 4,
                fontSize: 'var(--t-xs)',
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              A · {presetOptionLabel(presetA)}
            </div>
            <div
              className="panel-sub plain"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                padding: 'var(--s-1) var(--s-2)',
                borderRadius: 4,
                fontSize: 'var(--t-xs)',
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              B · {presetOptionLabel(presetB)}
            </div>
          </>
        ) : null}

        {/* Empty / progress / error overlay (before any capture). */}
        {errorMsg || !hasBoth ? (
          <div
            className="panel-sub plain"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--s-2)',
              textAlign: 'center',
              padding: 'var(--s-6)',
            }}
          >
            {errorMsg ? (
              <span className="form-err">{errorMsg}</span>
            ) : busy ? (
              'Capturing both times of day…'
            ) : (
              'Pick two times of day and click "Capture compare" to see them side-by-side.'
            )}
          </div>
        ) : null}
      </div>

      <div
        className="panel-sub plain"
        style={{ marginTop: 'var(--s-3)', minHeight: 16 }}
        aria-live="polite"
      >
        {busy
          ? 'Capturing…'
          : hasBoth
            ? 'Drag the divider to compare. Your own time-of-day setting is restored on close.'
            : ' '}
      </div>
    </Modal>
  )
}
