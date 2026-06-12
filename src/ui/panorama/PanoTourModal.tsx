import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { allPlanRooms, levelElevation } from '../../floorplan/levels'
import { capturePanorama } from '../../scene/panorama/capturePanorama'
import { useStore } from '../../state/store'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import { PanoramaViewer } from './PanoramaViewer'
import { computeDesignKey, evictPanoStop, getPanoCached, putPanoCached } from './panoImageIdb'
import {
  hotspotScreenPosition,
  MAX_TOUR_STOPS,
  PANO_EYE_HEIGHT,
  type PanoTourStop,
  stopHotspots,
  stopInitialYaw,
  type TourHotspot,
} from './panoTour'
import { INITIAL_LOOK, type LookState } from './viewerLook'

/** Brief fade when jumping between stops (CSS opacity transition). */
const FADE_MS = 220

/**
 * Linked 360° tour viewer (P-720) — Coohom-parity "720° tour". Shows the
 * active stop's panorama in the shared drag-to-look sphere viewer with
 * clickable **hotspot markers** overlaid at the yaw/pitch toward each nearby
 * same-storey stop (derived in the pure `panoTour.ts`); clicking (or tapping)
 * a hotspot fades to that stop's panorama, keeping the travel direction in
 * view. A stop strip below allows direct jumps + management (add / delete).
 *
 * Panoramas are captured live per stop (eye = the stop's recorded position at
 * standing height) and cached in **IndexedDB** (keyed by stop id + a design
 * hash), so re-visiting a stop skips the expensive re-render until the design
 * changes. Stale cache entries (wrong design hash) are evicted on access.
 *
 * Per-stop **initial yaw**: on first arrival at a stop (not a hotspot jump)
 * the viewer faces the room-centre using `stopInitialYaw`, so the user
 * immediately sees the room they're standing in.
 */
export function PanoTourModal() {
  const open = useStore((s) => s.panoTourOpen)
  const setOpen = useStore((s) => s.setPanoTourOpen)
  const stops = useStore(useShallow((s) => s.panoTourStops))
  const activeId = useStore((s) => s.panoTourActiveId)
  const setActive = useStore((s) => s.setPanoTourActive)
  const removeStop = useStore((s) => s.removePanoTourStop)

  const active: PanoTourStop | null = stops.find((s) => s.id === activeId) ?? stops[0] ?? null

  const [pano, setPano] = useState<HTMLCanvasElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [fading, setFading] = useState(false)
  const [look, setLook] = useState<LookState>(INITIAL_LOOK)
  const [aspect, setAspect] = useState(16 / 9)
  /** Orientation for the next pano mount (faces the travel direction after a jump
   *  — or the room centre on plain stop selection). */
  const nextLook = useRef<LookState>(INITIAL_LOOK)
  /** Bumped by Re-capture to force a fresh render of the active stop. */
  const [captureNonce, setCaptureNonce] = useState(0)

  const activeStopId = active?.id ?? null

  /**
   * Compute the design key that qualifies the IDB cache entry. This runs
   * synchronously against the current store so it's always fresh.
   */
  function currentDesignKey(): string {
    const s = useStore.getState()
    return computeDesignKey({
      items: s.items,
      finishes: s.finishes,
      floorPlan: s.floorPlan,
      doors: s.doors,
      userFurniture: s.userFurniture,
    })
  }

  // Capture (or pull from the IDB cache) the active stop's panorama.
  // Keyed on the stop id (not the `active` object, whose identity churns with
  // the stops array) — the stop data is re-read fresh from the store.
  // biome-ignore lint/correctness/useExhaustiveDependencies: captureNonce is a deliberate re-trigger (Re-capture button).
  useEffect(() => {
    const stopId = activeStopId
    const stop = stopId ? useStore.getState().panoTourStops.find((s) => s.id === stopId) : undefined
    if (!open || !stop) {
      setPano(null)
      setFailed(false)
      setBusy(false)
      return
    }

    let alive = true
    const designKey = currentDesignKey()

    // Try the IDB cache first (skip capture if cache hit with matching design key).
    void getPanoCached(stop.id, designKey).then((cached) => {
      if (!alive) return
      if (cached) {
        setPano(cached)
        setFading(false)
        setBusy(false)
        return
      }
      // Cache miss — capture live.
      setBusy(true)
      setFailed(false)
      // Let the modal paint its "capturing" state before the blocking renders.
      const t = setTimeout(() => {
        if (!alive) return
        const plan = useStore.getState().floorPlan
        const eyeY = levelElevation(plan, stop.levelId) + PANO_EYE_HEIGHT
        void capturePanorama({ eye: [stop.position[0], eyeY, stop.position[1]] }).then((res) => {
          if (!alive) return
          if (res) {
            // Persist to IDB for future visits.
            void putPanoCached(stop.id, designKey, res.canvas)
          }
          setPano(res?.canvas ?? null)
          setFailed(!res)
          setBusy(false)
          setFading(false)
        })
      }, 30)
      return () => clearTimeout(t)
    })

    return () => {
      alive = false
    }
  }, [open, activeStopId, captureNonce])

  const jumpTo = useCallback(
    (stopId: string, hotspot?: TourHotspot) => {
      if (hotspot) {
        // Facing the direction of travel on arrival (hotspot click).
        nextLook.current = { yaw: hotspot.yaw, pitch: 0, fov: look.fov }
      } else {
        // Direct stop selection: face the room centre.
        const stop = useStore.getState().panoTourStops.find((s) => s.id === stopId)
        if (stop) {
          const plan = useStore.getState().floorPlan
          const rooms = allPlanRooms(plan)
          nextLook.current = {
            yaw: stopInitialYaw(stop, rooms),
            pitch: 0,
            fov: look.fov,
          }
        } else {
          nextLook.current = { ...INITIAL_LOOK, fov: look.fov }
        }
      }
      setFading(true)
      setTimeout(() => setActive(stopId), FADE_MS)
    },
    [look.fov, setActive],
  )

  const addStop = () => {
    const id = useStore.getState().addPanoTourStopHere()
    if (!id) {
      useStore.getState().notify.start({
        title: `Tour is full (${MAX_TOUR_STOPS} stops max)`,
        kind: 'error',
      })
    }
  }

  const recapture = () => {
    if (!active) return
    // Force a fresh capture by evicting the IDB entry for this stop.
    void evictPanoStop(active.id)
    setCaptureNonce((n) => n + 1)
  }

  const download = () => {
    if (!pano || !active) return
    const a = document.createElement('a')
    a.href = pano.toDataURL('image/png')
    a.download = `hdb-360-tour-${active.label.replace(/\s+/g, '-').toLowerCase()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    useStore.getState().notify.start({ title: 'Panorama saved to your downloads', kind: 'success' })
  }

  const hotspots = active ? stopHotspots(active, stops) : []
  const onLook = useCallback((l: LookState, size: { width: number; height: number }) => {
    setLook(l)
    setAspect(size.width / Math.max(1, size.height))
  }, [])

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="360° tour"
      sub="Linked panoramas — click a hotspot to walk room to room"
      width={760}
      panelId="pano-tour"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={addStop}
              disabled={stops.length >= MAX_TOUR_STOPS}
              title="Add the current viewpoint as a tour stop"
            >
              Add stop here
            </button>
            <button type="button" className="btn" onClick={recapture} disabled={!active || busy}>
              Re-capture
            </button>
          </div>
          <button type="button" className="btn btn-accent" onClick={download} disabled={!pano}>
            Download PNG
          </button>
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
        {pano && active ? (
          <>
            <PanoramaViewer
              pano={pano}
              ariaLabel={`360 degree tour: ${active.label}`}
              initialLook={nextLook.current}
              onLook={onLook}
            />
            {/* Hotspot markers projected from yaw/pitch into screen space. */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {hotspots.map((h) => {
                const p = hotspotScreenPosition(look, h.yaw, h.pitch, aspect)
                if (!p) return null
                return (
                  <button
                    key={h.stopId}
                    type="button"
                    className="btn btn-soft"
                    style={{
                      position: 'absolute',
                      left: `${p.left}%`,
                      top: `${p.top}%`,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    title={`Go to ${h.label} (${h.distance.toFixed(1)} m)`}
                    aria-label={`Go to ${h.label}`}
                    onClick={() => jumpTo(h.stopId, h)}
                  >
                    <Icon.Walkthrough width={14} height={14} />
                    {h.label}
                  </button>
                )
              })}
            </div>
            {/* Brief fade while jumping between stops. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'var(--surface-3)',
                opacity: fading || busy ? 1 : 0,
                transition: `opacity ${FADE_MS}ms ease`,
                pointerEvents: 'none',
              }}
            />
          </>
        ) : null}
        {!pano || busy ? (
          <div
            className="panel-sub"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              textTransform: 'none',
              letterSpacing: 0,
              padding: 16,
            }}
          >
            {busy
              ? `Capturing ${active?.label ?? 'panorama'}…`
              : failed
                ? 'Could not capture — try Re-capture.'
                : stops.length === 0
                  ? 'No stops yet — frame a room, then "Add stop here". Add stops in several rooms to link them with hotspots.'
                  : ''}
          </div>
        ) : null}
      </div>

      {/* Stop strip — direct jumps + per-stop delete. */}
      {stops.length > 0 ? (
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 10,
            overflowX: 'auto',
            paddingBottom: 2,
          }}
        >
          {stops.map((s, i) => (
            <div key={s.id} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                className={`btn btn-soft${active?.id === s.id ? ' on' : ''}`}
                aria-pressed={active?.id === s.id}
                onClick={() => (active?.id === s.id ? undefined : jumpTo(s.id))}
                title={s.levelId ? `${s.label} (upper storey)` : s.label}
              >
                {i + 1}. {s.label}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove stop ${s.label}`}
                title="Remove this stop"
                onClick={() => {
                  void evictPanoStop(s.id)
                  removeStop(s.id)
                }}
              >
                <Icon.Trash width={12} height={12} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {stops.length === 1 ? (
        <div
          className="panel-sub"
          style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0 }}
        >
          Add a stop in another room to link them with a hotspot.
        </div>
      ) : null}
    </Modal>
  )
}
