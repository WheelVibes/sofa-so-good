import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFeature } from '../features/useFeature'
import { roomAtPoint, walkLevel } from '../floorplan/levels'
import { cameraPose, cameraPosXZ } from '../scene/cameras/cameraForward'
import { useStore } from '../state/store'
import { shouldReduceMotion } from './motionPreference'
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
 *
 * ## WALK MODE, ON PHONES ONLY (V14)
 * `.navcluster` is `display: none` under `body.mobile`, and <Minimap> is one of
 * its children — so the hide V4 fixed for orbit was never orbit-only. A phone
 * user in WALK mode had no map, no compass and no room label either. (The R7-G
 * audit's claim that "walk mode keeps its minimap on phones" was factually
 * wrong; it is corrected in that document.)
 *
 * The fix is this label, NOT a phone minimap, and the research behind that
 * choice is worth stating because the obvious answer is the wrong one:
 *   - No mainstream mobile virtual-tour product ships a persistent minimap in
 *     first-person. Matterport puts Dollhouse and Floor Plan behind BUTTONS
 *     (bottom-left); Kuula's floor plan is opt-in behind the player menu;
 *     Pannellum's `compass` option defaults to FALSE.
 *   - Map aids show no measured spatial-learning benefit: Ding, Chan & Saunders,
 *     *Cognitive Research: Principles and Implications*, 4 Jun 2026 — "no
 *     evidence that the structural map previews improved overall accuracy"
 *     (https://pmc.ncbi.nlm.nih.gov/articles/PMC13462025/).
 *   - Head-to-head, a compass is the WORST of the three aids: Varshney et al.,
 *     "Actionable Guidance Outperforms Map and Compass Cues in Demanding
 *     Immersive VR Wayfinding", arXiv 2603.17238 (Mar/Jul 2026), 42 participants
 *     / 1008 trials — arrow > minimap > compass. What wins is a cue readable
 *     *while moving*, with no mental rotation. A room name is exactly that.
 *   - Landmark/place names are what pedestrians actually use, and their real
 *     job is confidence: May, Ross, Bayer & Tarkiainen, *Personal and Ubiquitous
 *     Computing* 7:331-338 (2003).
 *   - Phone chrome has to earn its pixels: Budiu, "Maximize Content-to-Chrome
 *     Ratio", NN/g, 3 Aug 2014; Apple HIG *Game controls* — virtual controls
 *     "eat into screen real estate, so they need to earn their place", and a
 *     player cannot attend to the thumbstick and another element at once.
 *   - A rotating minimap is also the one option with an accessibility bill: it
 *     is interaction-triggered animation under WCAG 2.2 SC 2.3.3, and it is the
 *     opposite of a static rest frame (a recognised cybersickness mitigation).
 *     A static text label owes nothing.
 * Cost matters too: this label is one text node on the existing rAF loop and
 * costs zero draw calls, which is the right trade on a phone already running at
 * DPR 0.5.
 *
 * Deliberately NOT shipped here: a phone minimap, a compass, and the
 * arrow/"actionable guidance" cue that actually won Varshney et al. — the last
 * is a real option if anyone reports getting lost, but it is a much bigger
 * build and should follow evidence from this one, not precede it.
 */
export function OrbitRoomReadout() {
  const cameraMode = useStore((s) => s.cameraMode)
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const isMobile = useIsMobile()
  const walkReadout = useFeature('walkRoomReadout')
  // V14: on a phone the readout ALSO covers walk mode, where the desktop's
  // minimap is unavailable (see the WALK MODE block in this file's doc comment).
  const walking = cameraMode === 'firstPerson'
  const walkMode = isMobile && walking && walkReadout
  const active = cameraMode === 'orbit' || walkMode
  // Selected (not read through `shouldReduceMotion()` alone) so flipping the
  // in-app toggle mid-session re-renders this component — the same pattern
  // `useAmbientFx.ts` documents. The value itself still comes from the shared
  // helper, which ORs the OS query with the in-app override.
  useStore((s) => s.reduceMotion)
  const reduced = shouldReduceMotion()
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
    if (!active) return
    let raf = 0
    let lastRoomId: string | null = null
    const tick = () => {
      // WALK: the walker IS standing in a room, so there is no framing to
      // second-guess — read the camera's own position (`cameraPosXZ`, the same
      // "where the walker is" source `panoTourSlice` and `Minimap` use) and skip
      // the distance gate entirely. ORBIT: read the look-at TARGET instead, and
      // apply V3's framing gate — a whole-flat (or wider) framing still resolves
      // the target to SOME room via a bare point-in-polygon test (a corridor,
      // most often), which is worse than saying nothing at that zoom level.
      let px: number
      let pz: number
      if (walking) {
        px = cameraPosXZ.x
        pz = cameraPosXZ.z
      } else {
        const dx = cameraPose.px - cameraPose.tx
        const dy = cameraPose.py - cameraPose.ty
        const dz = cameraPose.pz - cameraPose.tz
        if (Math.hypot(dx, dy, dz) >= HIDE_BEYOND_METRES) {
          if (lastRoomId !== null) {
            lastRoomId = null
            if (labelRef.current) labelRef.current.textContent = ''
            wrapRef.current?.classList.remove('visible')
            window.clearTimeout(announceTimer.current)
          }
          raf = requestAnimationFrame(tick)
          return
        }
        px = cameraPose.tx
        pz = cameraPose.tz
      }
      // While walking, resolve against the storey being WALKED — the same
      // `walkLevel` lever `FirstPersonCamera` picks its collision walls with and
      // `Minimap` draws (the MINIMAP-LEVEL rule in `src/ui/CLAUDE.md`). It only
      // differs from a raw `viewLevelId` when that is `'all'`, but taking the
      // camera's own lever means the label agrees with the camera by
      // construction rather than by coincidence.
      const levelId = walking ? walkLevel(planRef.current, levelRef.current).id : levelRef.current
      const room = roomAtPoint(planRef.current, px, pz, levelId)
      const roomId = room?.id ?? null
      if (roomId !== lastRoomId) {
        lastRoomId = roomId
        if (labelRef.current) labelRef.current.textContent = room?.name ?? ''
        wrapRef.current?.classList.toggle('visible', room != null)
        window.clearTimeout(announceTimer.current)
        if (room) {
          announceTimer.current = window.setTimeout(() => {
            // Mode-accurate copy: orbit looks AT a room from outside, walk
            // stands IN one. "Now viewing the Kitchen" is wrong for a walker.
            setAnnounced(walking ? `Now in the ${room.name}` : `Now viewing the ${room.name}`)
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
  }, [active, walking])

  if (!active) return null

  // Mobile has two distinct slots, because the two camera modes have different
  // neighbours: orbit's pill is top-centre (nothing else lives there in orbit),
  // walk's is top-LEFT, mirroring `.walk-measure-dock`'s top-right across the
  // same row and leaving top-centre to WalkHud's own `walk-mode` InfoCallout.
  const mobileVariant = walkMode ? ' room-readout-walk-mobile' : ' orbit-room-readout-mobile'
  // The visible pill stays out of the accessibility tree — its text can
  // change every frame while dragging, which is exactly the "spam" the
  // debounced region below exists to avoid announcing (V2).
  const pill = (
    <div
      ref={wrapRef}
      className={`orbit-room-readout${isMobile ? mobileVariant : ''} pointer-events-none`}
      aria-hidden="true"
      // The only motion this component has is the room-change cross-fade.
      // WCAG 2.2 SC 2.3.3 treats interaction-triggered animation as something
      // a user must be able to switch off, and walking IS the interaction that
      // drives this one — so honour the shared gate (OS query OR the in-app
      // "Reduce motion" control) and snap instead of fading.
      style={reduced ? { transition: 'none' } : undefined}
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
