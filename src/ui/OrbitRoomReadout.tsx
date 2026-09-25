import { useEffect, useRef } from 'react'
import { roomAtPoint } from '../floorplan/levels'
import { cameraPose } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'

/**
 * Live "which room am I looking at" readout for orbit mode (U6) — the orbit
 * counterpart of the walk-mode minimap's live room highlight/name
 * (`Minimap.tsx`'s per-frame `pointInRoom` lookup over the WALKED storey).
 * Reuses the exact same lookup rather than re-deriving it:
 * `floorplan/levels.ts:roomAtPoint` is the shared `pointInRoom`-backed
 * helper other consumers (the electrical/finish plan exports, `doorSwing.ts`)
 * already call.
 *
 * Orbit has no walking camera position to test, so it reads the ORBIT
 * CAMERA'S OWN LOOK-AT TARGET (`cameraPose.tx/tz`, written every frame by
 * `<OrbitCamera>`) — the same "what orbit is looking AT" choice
 * `panoTourSlice.ts` already makes (`walk ? cameraPosXZ : cameraPose.tx/tz`
 * for its pano-tour resume point).
 *
 * Rendered like `Minimap`: a rAF loop writes straight to a DOM ref instead of
 * React state, so an orbit drag (which moves the target every frame) costs a
 * cheap room lookup + a conditional attribute write, never a re-render. Only
 * an actual ROOM CHANGE touches the DOM.
 */
export function OrbitRoomReadout() {
  const cameraMode = useStore((s) => s.cameraMode)
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const wrapRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  // Refreshed on render, read fresh every rAF tick — the same pattern
  // Minimap's `roomsRef` uses so the tick never closes over a stale plan.
  const planRef = useRef(plan)
  const levelRef = useRef(viewLevelId)
  useEffect(() => {
    planRef.current = plan
    levelRef.current = viewLevelId
  }, [plan, viewLevelId])

  useEffect(() => {
    if (cameraMode !== 'orbit') return
    let raf = 0
    let lastRoomId: string | null = null
    const tick = () => {
      const room = roomAtPoint(planRef.current, cameraPose.tx, cameraPose.tz, levelRef.current)
      const roomId = room?.id ?? null
      if (roomId !== lastRoomId) {
        lastRoomId = roomId
        if (labelRef.current) labelRef.current.textContent = room?.name ?? ''
        wrapRef.current?.classList.toggle('visible', room != null)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cameraMode])

  if (cameraMode !== 'orbit') return null

  return (
    <div ref={wrapRef} className="orbit-room-readout pointer-events-none" aria-hidden="true">
      <span ref={labelRef} />
    </div>
  )
}
