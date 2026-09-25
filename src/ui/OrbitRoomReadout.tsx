import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { roomAtPoint } from '../floorplan/levels'
import { cameraPose } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { useIsMobile } from './useIsMobile'

/** Beyond this camera-to-target distance (metres) the frame holds more than one
 *  room — a whole-flat dollhouse view sits at ~20 m for the default 4-room flat,
 *  a single focused room at ≤4.5 m — so naming whichever room the target
 *  technically lands in (often a 1.2 m-wide corridor) is dishonest (V3, R7-J
 *  visual-verification audit). Suppress the readout the same way as "outside
 *  every room" rather than inventing a second, half-true label. */
const HIDE_BEYOND_METRES = 15

/** Visually-hidden style for the debounced screen-reader announcement — present
 *  in the accessibility tree but invisible + zero-footprint, mirroring the
 *  established `SR_ONLY` pattern in `notifications/NotificationContainer.tsx`
 *  (kept local here rather than shared/exported so this file doesn't reach into
 *  another feature's module for a five-line style object). */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

/** How long the target must sit in a room before it's announced to assistive
 *  tech (V2). A fast orbit drag can cross several rooms within a second — the
 *  WAI-ARIA APG's live-region guidance is to throttle/debounce updates for
 *  frequently-changing content and announce only the value the user settles
 *  on, not every intermediate change (see the commit message for the source).
 *  The VISIBLE pill still updates every frame with zero delay (sighted users
 *  watching it change while dragging is the whole point); only the announcement
 *  is debounced. */
const ANNOUNCE_DEBOUNCE_MS = 500

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
 * <OrbitCamera>) — the same "what orbit is looking AT" choice
 * `panoTourSlice.ts` already makes (`walk ? cameraPosXZ : cameraPose.tx/tz`
 * for its pano-tour resume point).
 *
 * Rendered like `Minimap`: a rAF loop writes straight to a DOM ref instead of
 * React state, so an orbit drag (which moves the target every frame) costs a
 * cheap room lookup + a conditional attribute write, never a re-render. Only
 * an actual ROOM CHANGE touches the DOM.
 *
 * V4 (R7-J): mounted independently of `.navcluster` rather than as one of its
 * flex children. `.navcluster` is `display: none` under `body.mobile` (the
 * compass/zoom/save-view controls are redundant next to pinch/drag gestures on
 * a phone) — that blanket hide was inherited by this 31px, `pointer-events:
 * none` label too, on exactly the platform where a shared showroom link is
 * overwhelmingly opened and orientation matters most. On mobile this renders
 * via a portal straight onto `document.body` (still governed by the SAME
 * `cameraMode !== 'orbit'` early-return and the same rAF loop — one instance,
 * one aria-live region, not a duplicate) so it survives `.navcluster`'s
 * display:none; `.orbit-room-readout-mobile` (parts.css) fixes it top-centre,
 * clear of the floating mobile toolbar above it (matches WalkHud's own 104px
 * clearance for the same bar) and the toast host / showroom badge / joystick
 * below (all bottom-anchored) in both portrait and landscape.
 */
export function OrbitRoomReadout() {
  const cameraMode = useStore((s) => s.cameraMode)
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const isMobile = useIsMobile()
  const wrapRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  // Debounced text for the screen-reader-only live region (V2) — see
  // ANNOUNCE_DEBOUNCE_MS above. Separate from the instant `labelRef` write so
  // the visual pill never waits on it.
  const [announced, setAnnounced] = useState('')
  const announceTimer = useRef(0)
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
      // V3: a whole-flat (or wider) framing still resolves the target to
      // SOME room via a bare point-in-polygon test — a corridor, most often —
      // which is worse than saying nothing at that zoom level. Gate on the
      // camera's distance to its own look-at target before even doing the
      // room lookup.
      const dx = cameraPose.px - cameraPose.tx
      const dy = cameraPose.py - cameraPose.ty
      const dz = cameraPose.pz - cameraPose.tz
      const inRange = Math.hypot(dx, dy, dz) < HIDE_BEYOND_METRES
      const room = inRange
        ? roomAtPoint(planRef.current, cameraPose.tx, cameraPose.tz, levelRef.current)
        : null
      const roomId = room?.id ?? null
      if (roomId !== lastRoomId) {
        lastRoomId = roomId
        if (labelRef.current) labelRef.current.textContent = room?.name ?? ''
        wrapRef.current?.classList.toggle('visible', room != null)
        window.clearTimeout(announceTimer.current)
        if (room) {
          announceTimer.current = window.setTimeout(() => {
            setAnnounced(`Now viewing the ${room.name}`)
          }, ANNOUNCE_DEBOUNCE_MS)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(announceTimer.current)
    }
  }, [cameraMode])

  if (cameraMode !== 'orbit') return null

  // The visible pill stays out of the accessibility tree — its text can
  // change every frame while dragging, which is exactly the "spam" the
  // debounced region below exists to avoid announcing (V2).
  const pill = (
    <div
      ref={wrapRef}
      className={`orbit-room-readout${isMobile ? ' orbit-room-readout-mobile' : ''} pointer-events-none`}
      aria-hidden="true"
    >
      <span ref={labelRef} />
    </div>
  )
  // role="status" implies aria-live="polite" + aria-atomic="true" (ARIA22 —
  // "Using role=status to present status messages"): announced without
  // interrupting, and read as one whole update rather than a diff.
  const live = (
    <div style={SR_ONLY} role="status" aria-live="polite" aria-atomic="true">
      {announced}
    </div>
  )
  const content = (
    <>
      {pill}
      {live}
    </>
  )

  return isMobile ? createPortal(content, document.body) : content
}
