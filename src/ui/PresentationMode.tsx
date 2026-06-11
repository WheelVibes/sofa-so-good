import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { capturePanorama } from '../scene/panorama/capturePanorama'
import { useStore } from '../state/store'
import { PanoramaViewer } from './panorama/PanoramaViewer'
import {
  AUTO_ADVANCE_MS,
  PANO_FLY_SETTLE_MS,
  shouldAutoAdvance,
  wrapIndex,
} from './presentation/slideLogic'
import { Icon } from './toolbar/icons'

/**
 * Full-screen client presentation: steps through the saved camera views as a
 * slideshow, applying each view (angle + lighting) and showing its name + an
 * optional presenter note as a caption. Arrow keys / on-screen controls navigate;
 * Esc exits; an Auto toggle advances on a timer. The overlay is pointer-through
 * except for its control bar, so the user can still nudge the camera mid-slide.
 *
 * Views marked **360°** (`SavedView.pano`) present as interactive panorama
 * slides: when the slide is reached the camera flies to the view's pose, a
 * panorama is captured live from there (brief "Capturing…" state; cached per
 * view for the session), and the shared drag-to-look sphere viewer fills the
 * slide. Auto-advance pauses on these slides (see `slideLogic.ts`).
 *
 * Gated by the `presentation` feature flag at the mount site (App).
 */
export function PresentationMode() {
  const presenting = useStore((s) => s.presenting)
  const setPresenting = useStore((s) => s.setPresenting)
  const views = useStore(useShallow((s) => s.savedViews))
  const applyView = useStore((s) => s.applyView)
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(false)
  const [pano, setPano] = useState<HTMLCanvasElement | null>(null)
  const [capturing, setCapturing] = useState(false)
  /** Session cache of captured panoramas, keyed by view id (cleared on exit). */
  const panoCache = useRef(new Map<string, HTMLCanvasElement>())

  const count = views.length
  const goTo = useCallback((next: number) => setIndex(wrapIndex(next, count)), [count])

  const view = presenting && count > 0 ? views[Math.min(index, count - 1)] : undefined
  const viewId = view?.id
  const isPano = !!view?.pano

  // Apply the active view whenever the slide changes while presenting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyView is a stable store action; re-applying on slide change is the intent.
  useEffect(() => {
    if (presenting && viewId) applyView(viewId)
  }, [presenting, viewId])

  // Capture the panorama for a 360° slide, lazily, when the slide is reached.
  // Lazy (vs pre-capturing on entry) because applying a view restores the
  // camera via an animated fly — pre-capturing every pano view would mean
  // flying through all of them before the show starts. Cached per view id for
  // the session so revisiting a slide is instant.
  useEffect(() => {
    if (!presenting || !viewId || !isPano) {
      setPano(null)
      setCapturing(false)
      return
    }
    const cached = panoCache.current.get(viewId)
    if (cached) {
      setPano(cached)
      return
    }
    setPano(null)
    setCapturing(true)
    let alive = true
    // Wait for the saved-view camera fly to land before capturing.
    const t = setTimeout(() => {
      void capturePanorama().then((res) => {
        if (!alive) return
        if (res) panoCache.current.set(viewId, res.canvas)
        // On failure fall back silently to the regular slide — the camera is
        // already at the view's pose, so the live render stands in.
        setPano(res?.canvas ?? null)
        setCapturing(false)
      })
    }, PANO_FLY_SETTLE_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [presenting, viewId, isPano])

  // Reset to the first slide each time presentation starts; drop captures on exit.
  useEffect(() => {
    if (presenting) setIndex(0)
    else {
      setAuto(false)
      panoCache.current.clear()
    }
  }, [presenting])

  // Keyboard navigation while presenting.
  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false)
      else if (e.key === 'ArrowRight' || e.key === ' ') goTo(index + 1)
      else if (e.key === 'ArrowLeft') goTo(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presenting, index, goTo, setPresenting])

  // Auto-advance timer — paused on 360° slides (the user is exploring).
  useEffect(() => {
    if (!shouldAutoAdvance({ presenting, auto, count, isPanoSlide: isPano })) return
    const t = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [presenting, auto, index, count, goTo, isPano])

  if (!presenting || count === 0 || !view) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 'var(--z-overlay)' as unknown as number,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 360° slide: the interactive sphere viewer fills the screen under the bars. */}
      {isPano && pano ? (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <PanoramaViewer pano={pano} ariaLabel={`360 degree slide: ${view.name}`} />
        </div>
      ) : null}
      {isPano && capturing ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="panel"
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 'var(--t-sm)' }}
          >
            Capturing 360°…
          </span>
        </div>
      ) : null}

      {/* Top bar: title + exit */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--s-3)',
          pointerEvents: 'auto',
          background: 'linear-gradient(to bottom, var(--scrim, rgba(0,0,0,0.45)), transparent)',
        }}
      >
        <span style={{ color: 'var(--on-scrim, #fff)', fontWeight: 600, fontSize: 'var(--t-sm)' }}>
          Presentation · {index + 1} / {count}
          {isPano ? ' · 360°' : ''}
        </span>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => setPresenting(false)}
          title="Exit presentation (Esc)"
        >
          <Icon.Close width={16} height={16} />
          Exit
        </button>
      </div>

      {/* Bottom caption + controls */}
      <div
        style={{
          position: 'relative',
          pointerEvents: 'auto',
          padding: 'var(--s-4)',
          background: 'linear-gradient(to top, var(--scrim, rgba(0,0,0,0.55)), transparent)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
        }}
      >
        <div style={{ color: 'var(--on-scrim, #fff)', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-lg)' }}>{view.name}</div>
          {view.note ? (
            <div style={{ fontSize: 'var(--t-sm)', opacity: 0.9, marginTop: 4, maxWidth: '60ch' }}>
              {view.note}
            </div>
          ) : null}
          {isPano && pano ? (
            <div style={{ fontSize: 'var(--t-xs)', opacity: 0.75, marginTop: 4 }}>
              Drag to look around · scroll to zoom{auto ? ' · auto-advance paused' : ''}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flex: '0 0 auto' }}>
          <button
            type="button"
            className={`btn btn-soft${auto ? ' on' : ''}`}
            onClick={() => setAuto((a) => !a)}
            title="Auto-advance slides (pauses on 360° slides)"
          >
            {auto ? 'Auto ⏸' : 'Auto ▶'}
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => goTo(index - 1)}
            aria-label="Previous view"
          >
            <Icon.ArrowLeft width={16} height={16} />
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => goTo(index + 1)}
            aria-label="Next view"
          >
            <Icon.ChevronRight width={16} height={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
