import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../features/useFeature'
import { allPlanRooms, levelElevation } from '../floorplan/levels'
import { capturePanorama } from '../scene/panorama/capturePanorama'
import { useStore } from '../state/store'
import { PanoramaViewer } from './panorama/PanoramaViewer'
import { computeDesignKey, getPanoCached, putPanoCached } from './panorama/panoImageIdb'
import { PANO_EYE_HEIGHT, stopInitialYaw } from './panorama/panoTour'
import type { LookState } from './panorama/viewerLook'
import type { Slide } from './presentation/slideLogic'
import {
  AUTO_ADVANCE_MS,
  composeTourSlides,
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
 * slide.
 *
 * **Tour stops** (when `presentationIncludeTour` is true and the `panoTour` flag
 * is on): the tour stops are appended as panorama slides after the saved views.
 * Each stop uses the same `capturePanorama({eye})` + `panoImageIdb` cache path
 * as `PanoTourModal` — the same cache, so a stop captured during the tour is
 * instantly available in the presentation too. Auto-advance pauses on all
 * panorama slides (see `slideLogic.ts`).
 *
 * Gated by the `presentation` feature flag at the mount site (App).
 */
export function PresentationMode() {
  const enabled = useFeature('presentation')
  const presenting = useStore((s) => s.presenting)
  const setPresenting = useStore((s) => s.setPresenting)
  const views = useStore(useShallow((s) => s.savedViews))
  const stops = useStore(useShallow((s) => s.panoTourStops))
  const includeTour = useStore((s) => s.presentationIncludeTour)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const applyView = useStore((s) => s.applyView)

  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(false)
  const [pano, setPano] = useState<HTMLCanvasElement | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [initialLook, setInitialLook] = useState<LookState | undefined>(undefined)

  /**
   * Session cache: in-memory canvas cache keyed by a string that is either the
   * view id (for SavedView pano slides) or `stop:<stopId>` (for tour-stop slides).
   * Cleared on presentation exit.
   */
  const panoCache = useRef(new Map<string, HTMLCanvasElement>())

  // Build the composed slide deck.
  const slides: Slide[] = composeTourSlides(views, stops, includeTour, viewLevelId)
  const count = slides.length
  const goTo = useCallback((next: number) => setIndex(wrapIndex(next, count)), [count])

  const slide = presenting && count > 0 ? slides[Math.min(index, count - 1)] : undefined
  const isViewSlide = slide?.kind === 'view'
  const isTourSlide = slide?.kind === 'tourStop'
  const isPano = isViewSlide ? !!slide.view.pano : isTourSlide

  // Stable label for the current slide (used in the caption bar).
  const slideLabel = isViewSlide ? slide.view.name : isTourSlide ? slide.stop.label : ''
  const slideNote = isViewSlide ? (slide.view.note ?? null) : null

  // Stable per-slide identity values used as effect deps so that react hooks see
  // scalar primitives rather than object references (avoids spurious re-runs when
  // the slides array re-creates with the same identity).
  const activeViewId = isViewSlide ? slide.view.id : null
  const activeTourStopId = isTourSlide ? slide.stop.id : null
  const activeTourStopLevelId = isTourSlide ? slide.stop.levelId : undefined
  const activeTourStopPosition = isTourSlide ? slide.stop.position : undefined

  // Apply the active saved-view whenever the slide changes while presenting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applyView is a stable store action; re-applying on slide change is the intent.
  useEffect(() => {
    if (presenting && activeViewId) applyView(activeViewId)
  }, [presenting, activeViewId])

  // Capture the panorama for a 360° slide (view pano or tour stop), lazily.
  //
  // View panos: capture from the current camera after the fly lands (no eye
  // override — the same as the previous behaviour).
  //
  // Tour-stop slides: capture from the stop's recorded eye position via
  // `capturePanorama({eye})`, using the IDB cache (matching PanoTourModal).
  // On cache hit the panorama is instant; on miss it goes through the same live-
  // capture → IDB-persist path as the tour modal does.
  useEffect(() => {
    if (!presenting || !isPano) {
      setPano(null)
      setCapturing(false)
      setInitialLook(undefined)
      return
    }

    // Resolve the cache key: view id for view-pano slides, "stop:<id>" for tour stops.
    const cacheKey = activeViewId ?? (activeTourStopId ? `stop:${activeTourStopId}` : null)
    if (!cacheKey) return

    const cached = panoCache.current.get(cacheKey)
    if (cached) {
      setPano(cached)
      return
    }

    setPano(null)
    setCapturing(true)
    let alive = true

    if (activeTourStopId && activeTourStopPosition) {
      // Tour-stop slide: try IDB cache first, then live capture.
      const stopId = activeTourStopId
      const stopPosition = activeTourStopPosition
      const stopLevelId = activeTourStopLevelId
      const designKey = computeDesignKey({
        items: useStore.getState().items,
        finishes: useStore.getState().finishes,
        floorPlan: useStore.getState().floorPlan,
        doors: useStore.getState().doors,
        userFurniture: useStore.getState().userFurniture,
      })
      void getPanoCached(stopId, designKey).then((idbHit) => {
        if (!alive) return
        if (idbHit) {
          panoCache.current.set(cacheKey, idbHit)
          // Face the room centre on first arrival (same as PanoTourModal jumpTo).
          const plan = useStore.getState().floorPlan
          const rooms = allPlanRooms(plan)
          const yaw = stopInitialYaw(
            { id: stopId, label: '', position: stopPosition, levelId: stopLevelId },
            rooms,
          )
          setInitialLook({ yaw, pitch: 0, fov: 75 })
          setPano(idbHit)
          setCapturing(false)
          return
        }
        // Cache miss — live capture.
        const t = setTimeout(() => {
          if (!alive) return
          const planState = useStore.getState().floorPlan
          const eyeY = levelElevation(planState, stopLevelId) + PANO_EYE_HEIGHT
          void capturePanorama({ eye: [stopPosition[0], eyeY, stopPosition[1]] }).then((res) => {
            if (!alive) return
            if (res) {
              void putPanoCached(stopId, designKey, res.canvas)
              panoCache.current.set(cacheKey, res.canvas)
            }
            const plan2 = useStore.getState().floorPlan
            const rooms2 = allPlanRooms(plan2)
            const yaw = stopInitialYaw(
              { id: stopId, label: '', position: stopPosition, levelId: stopLevelId },
              rooms2,
            )
            setInitialLook({ yaw, pitch: 0, fov: 75 })
            setPano(res?.canvas ?? null)
            setCapturing(false)
          })
        }, 30)
        return () => clearTimeout(t)
      })
    } else {
      // View pano slide: capture from the current camera after the fly lands.
      const t = setTimeout(() => {
        void capturePanorama().then((res) => {
          if (!alive) return
          if (res) panoCache.current.set(cacheKey, res.canvas)
          setInitialLook(undefined)
          setPano(res?.canvas ?? null)
          setCapturing(false)
        })
      }, PANO_FLY_SETTLE_MS)
      return () => {
        alive = false
        clearTimeout(t)
      }
    }

    return () => {
      alive = false
    }
  }, [
    presenting,
    isPano,
    activeViewId,
    activeTourStopId,
    activeTourStopLevelId,
    activeTourStopPosition,
  ])

  // Reset to the first slide each time presentation starts; drop captures on exit.
  useEffect(() => {
    if (presenting) setIndex(0)
    else {
      setAuto(false)
      setPano(null)
      setCapturing(false)
      setInitialLook(undefined)
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

  // Auto-advance timer — paused on all panorama slides (view panos + tour stops).
  useEffect(() => {
    if (!shouldAutoAdvance({ presenting, auto, count, isPanoSlide: isPano })) return
    const t = setTimeout(() => goTo(index + 1), AUTO_ADVANCE_MS)
    return () => clearTimeout(t)
  }, [presenting, auto, index, count, goTo, isPano])

  if (!enabled || !presenting || count === 0 || !slide) return null

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
          <PanoramaViewer
            pano={pano}
            ariaLabel={`360 degree slide: ${slideLabel}`}
            initialLook={initialLook}
          />
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
            style={{
              padding: 'var(--s-3) var(--s-4)',
              borderRadius: 'var(--r-3)',
              fontSize: 'var(--t-sm)',
            }}
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
          background: 'linear-gradient(to bottom, var(--scrim), transparent)',
        }}
      >
        <span style={{ color: 'var(--on-scrim)', fontWeight: 600, fontSize: 'var(--t-sm)' }}>
          Presentation · {index + 1} / {count}
          {isPano ? ' · 360°' : ''}
          {isTourSlide ? ' · Tour' : ''}
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
          background: 'linear-gradient(to top, var(--scrim), transparent)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
        }}
      >
        <div style={{ color: 'var(--on-scrim)', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-lg)' }}>{slideLabel}</div>
          {slideNote ? (
            <div
              style={{
                fontSize: 'var(--t-sm)',
                opacity: 0.9,
                marginTop: 'var(--s-1)',
                maxWidth: '60ch',
              }}
            >
              {slideNote}
            </div>
          ) : null}
          {isPano && pano ? (
            <div style={{ fontSize: 'var(--t-xs)', opacity: 0.75, marginTop: 'var(--s-1)' }}>
              Drag to look around · scroll to zoom{auto ? ' · auto-advance paused' : ''}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--s-2)', flex: '0 0 auto' }}>
          <button
            type="button"
            className={`btn${auto ? ' on' : ''}`}
            onClick={() => setAuto((a) => !a)}
            title="Auto-advance slides (pauses on 360° slides)"
            aria-pressed={auto}
          >
            {auto ? <Icon.Pause width={14} height={14} /> : <Icon.Play width={14} height={14} />}
            Auto
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
