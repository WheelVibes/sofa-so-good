import { useCallback, useEffect, useRef, useState } from 'react'
import { useFeature } from '../features/useFeature'
import {
  FOCAL_PRESETS,
  FOCUS_MAX_M,
  FOCUS_MIN_M,
  FSTOP_PRESETS,
} from '../scene/cameras/cameraLensSettings'
import type { HqRenderSession } from '../scene/pathtrace/hqRenderSession'
import { getHqRenderSource } from '../scene/pathtrace/hqRenderSource'
import { useStore } from '../state/store'
import { Modal } from './Modal'

const RESOLUTIONS = [
  // Dev-only tiny size so the headless software-GL harness can exercise the
  // full pipeline in seconds (a real GPU renders 720p+ in the same time).
  ...(import.meta.env.DEV
    ? [{ id: 'dev-tiny', label: 'Tiny (dev) · 192×108', w: 192, h: 108 }]
    : []),
  { id: '720', label: 'HD · 1280×720', w: 1280, h: 720 },
  { id: '1080', label: 'Full HD · 1920×1080', w: 1920, h: 1080 },
  { id: '1440', label: 'QHD · 2560×1440', w: 2560, h: 1440 },
  { id: '2160', label: '4K · 3840×2160', w: 3840, h: 2160 },
]

const SAMPLE_STEPS = [64, 128, 256, 512, 1024] as const

/** Simple-fallback photographic DoF stops (F5); 0 = off (pinhole). Used when the
 *  full lens controls (`cameraDof` flag) are off. */
const DOF_STOPS = [
  { v: 0, label: 'DoF off' },
  { v: 8, label: 'f/8 · subtle' },
  { v: 2.8, label: 'f/2.8 · portrait' },
  { v: 1.4, label: 'f/1.4 · dramatic' },
] as const

/**
 * HQ Render (F1) — progressive path-traced still of the current view.
 * Creates a dedicated offscreen session (`hqRenderSession.ts`, dynamic-imports
 * three-gpu-pathtracer) from the live scene + camera pose; samples accumulate
 * with a live preview + progress, downloadable at any point. The session is
 * fully disposed on close, so the live raster pipeline is never affected.
 *
 * Lens + depth-of-field controls (PC2-CAM-DOF-LENS) are gated by the `cameraDof`
 * feature flag (pro tier): when on, the user picks a focal length + aperture +
 * focus distance, wired through the store (persisted via qualityPrefs). When off
 * (Simple mode), the lone f-stop dropdown is the fallback.
 */
export function HqRenderModal() {
  const open = useStore((s) => s.hqRenderOpen)
  const setOpen = useStore((s) => s.setHqRenderOpen)
  const hasLensControls = useFeature('cameraDof')

  // Lens + DoF live in the store (shared with the raster pass + persisted).
  const lensFocalMm = useStore((s) => s.lensFocalMm)
  const dofFStop = useStore((s) => s.dofFStop)
  const dofFocusDistance = useStore((s) => s.dofFocusDistance)
  const dofAuto = useStore((s) => s.dofAuto)
  const setLensFocalMm = useStore((s) => s.setLensFocalMm)
  const setDofFStop = useStore((s) => s.setDofFStop)
  const setDofFocusDistance = useStore((s) => s.setDofFocusDistance)
  const setDofAuto = useStore((s) => s.setDofAuto)

  const [resId, setResId] = useState<string>('1080')
  const [maxSamples, setMaxSamples] = useState<number>(256)
  const [samples, setSamples] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'building' | 'rendering' | 'done' | 'error'>('idle')
  const sessionRef = useRef<HqRenderSession | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  const teardown = useCallback(() => {
    sessionRef.current?.dispose()
    sessionRef.current = null
  }, [])

  useEffect(() => {
    if (!open) {
      teardown()
      setPhase('idle')
      setSamples(0)
    }
    return teardown
  }, [open, teardown])

  const start = useCallback(async () => {
    teardown()
    const src = getHqRenderSource()
    if (!src) {
      setPhase('error')
      return
    }
    const res = RESOLUTIONS.find((r) => r.id === resId) ?? RESOLUTIONS[1]
    setPhase('building')
    setSamples(0)
    try {
      const { createHqRenderSession } = await import('../scene/pathtrace/hqRenderSession')
      const session = await createHqRenderSession(src.scene, src.camera, {
        width: res.w,
        height: res.h,
        maxSamples,
        fStop: dofFStop || undefined,
        // Lens + manual focus only when the pro lens controls are enabled.
        focalLengthMm: hasLensControls ? lensFocalMm : undefined,
        focusDistance: hasLensControls && !dofAuto ? dofFocusDistance : undefined,
        onProgress: (n) => setSamples(n),
        onDone: () => setPhase('done'),
        onError: (err) => {
          if (import.meta.env.DEV) console.warn('HQ render failed:', err)
          setPhase('error')
        },
      })
      sessionRef.current = session
      const host = hostRef.current
      if (host) {
        host.innerHTML = ''
        session.canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'
        host.appendChild(session.canvas)
      }
      setPhase('rendering')
      session.start()
    } catch (err) {
      if (import.meta.env.DEV) console.warn('HQ render failed to start:', err)
      setPhase('error')
    }
  }, [
    resId,
    maxSamples,
    dofFStop,
    hasLensControls,
    lensFocalMm,
    dofAuto,
    dofFocusDistance,
    teardown,
  ])

  const download = () => {
    const session = sessionRef.current
    if (!session) return
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const a = document.createElement('a')
    a.href = session.toDataURL()
    a.download = `hdb-hq-render-${stamp}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    useStore.getState().notify.start({ title: 'Render saved to your downloads', kind: 'success' })
  }

  const busy = phase === 'building' || phase === 'rendering'
  const dofOn = dofFStop > 0

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="HQ render"
      sub="Path-traced photoreal still of the current view — let samples accumulate, save any time"
      width={760}
      panelId="hq-render"
      footer={
        <div className="flex items-center justify-between gap-2" style={{ width: '100%' }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <select
              className="input"
              aria-label="Render resolution"
              value={resId}
              onChange={(e) => setResId(e.target.value)}
              disabled={busy}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label="Render quality (samples)"
              value={maxSamples}
              onChange={(e) => setMaxSamples(Number(e.target.value))}
              disabled={busy}
            >
              {SAMPLE_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n} samples
                </option>
              ))}
            </select>
            {hasLensControls ? (
              <>
                <select
                  className="input"
                  aria-label="Lens focal length"
                  value={lensFocalMm}
                  onChange={(e) => setLensFocalMm(Number(e.target.value))}
                  disabled={busy}
                  title="Lens focal length (wider = more of the room, longer = tighter perspective)"
                >
                  {FOCAL_PRESETS.map((f) => (
                    <option key={f.mm} value={f.mm}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  aria-label="Aperture (f-stop)"
                  value={dofFStop}
                  onChange={(e) => setDofFStop(Number(e.target.value))}
                  disabled={busy}
                  title="Aperture — lower f-stop = shallower depth of field (more background blur)"
                >
                  {FSTOP_PRESETS.map((d) => (
                    <option key={d.v} value={d.v}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {dofOn ? (
                  <label
                    className="panel-sub flex items-center gap-1"
                    style={{ textTransform: 'none', letterSpacing: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={dofAuto}
                      onChange={(e) => setDofAuto(e.target.checked)}
                      disabled={busy}
                      aria-label="Auto-focus on the centre of the view"
                    />
                    Auto focus
                  </label>
                ) : null}
                {dofOn && !dofAuto ? (
                  <label
                    className="panel-sub flex items-center gap-1"
                    style={{ textTransform: 'none', letterSpacing: 0 }}
                  >
                    Focus
                    <input
                      className="input"
                      type="number"
                      min={FOCUS_MIN_M}
                      max={FOCUS_MAX_M}
                      step={0.1}
                      value={dofFocusDistance}
                      onChange={(e) => setDofFocusDistance(Number(e.target.value))}
                      disabled={busy}
                      aria-label="Focus distance (metres)"
                      style={{ width: 72 }}
                    />
                    m
                  </label>
                ) : null}
              </>
            ) : (
              <select
                className="input"
                aria-label="Depth of field"
                value={dofFStop}
                onChange={(e) => setDofFStop(Number(e.target.value))}
                disabled={busy}
                title="Focus locks on whatever is at the centre of the view"
              >
                {DOF_STOPS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {phase === 'rendering' ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  sessionRef.current?.stop()
                  setPhase('done')
                }}
              >
                Stop
              </button>
            ) : (
              <button type="button" className="btn" onClick={start} disabled={phase === 'building'}>
                {phase === 'done' || phase === 'error' ? 'Re-render' : 'Start render'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-accent"
              onClick={download}
              disabled={samples === 0}
            >
              Save PNG
            </button>
          </div>
        </div>
      }
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-3)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        {phase !== 'rendering' && phase !== 'done' ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'none',
              letterSpacing: 0,
              textAlign: 'center',
              padding: 16,
            }}
          >
            {phase === 'building'
              ? 'Preparing scene (building BVH)…'
              : phase === 'error'
                ? 'Could not start the render — your device may not support WebGL2. The PNG export in File still works.'
                : 'Pick a resolution and quality, then Start render. Higher samples = cleaner image, longer wait.'}
          </div>
        ) : null}
      </div>
      <div
        className="panel-sub"
        style={{ textTransform: 'none', letterSpacing: 0, marginTop: 8 }}
        aria-live="polite"
      >
        {samples > 0 ? `${samples} / ${maxSamples} samples` : ' '}
      </div>
    </Modal>
  )
}
