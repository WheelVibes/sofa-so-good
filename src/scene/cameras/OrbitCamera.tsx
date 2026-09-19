import { OrthographicCamera as DreiOrthographicCamera, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  TOUCH,
  Vector2,
  Vector3,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useAnyModalOpen } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { planExtent } from '../../floorplan/planExtent'
import { type FloorPlan, planBounds, planRoomArea } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { useIsMobile } from '../../ui/useIsMobile'
import { beginCameraGesture, endCameraGesture } from '../cameraMotionSignal'
import { getRoomEditorShell } from '../roomEditorShell'
import { cameraPose } from './cameraForward'
import { flyDurationFor, flyPose, smoothstep as smooth } from './cameraTween'
import {
  aspectChangedMaterially,
  clampOrbitDistance,
  FRAME_MARGIN,
  fitDistanceForFov,
  poseIsStillFramed,
} from './frameSelection'
import { easeShellPush, pushOutsideShell, shellBoxForPlan } from './orbitEnvelope'
import {
  type GestureArmState,
  initGestureArmState,
  initTwistGesture,
  isDoubleTap,
  onGestureChange,
  onGestureEnd,
  onGestureStart,
  orbitRotateSpeed,
  stepTwistGesture,
  TAP_MOVE_SLOP_PX,
  type TapRecord,
  type TwistGestureState,
  twoPointAngle,
  twoPointDistance,
} from './orbitTouchGestures'
import { orthoZoomForPerspective, perspectiveDistanceForOrthoZoom } from './orthoProjection'
import { computeVerticalLock } from './verticalLock'
import { VIEW_TOUR_LEG_SECONDS, type ViewTourFrame, viewTourFrames } from './viewTour'

/** Farthest a double-tap focus raycast may land and still count as a real hit —
 *  past this it's the sky dome / estate backdrop, not the flat (ORBIT-TOUCH-GESTURES). */
const FOCUS_RAYCAST_MAX_DISTANCE = 60

interface Framing {
  pos: Vector3
  tgt: Vector3
}

/** Mirror the live camera pose into the shared singleton (read by saved views). */
function writePose(pos: Vector3, tgt: Vector3): void {
  cameraPose.px = pos.x
  cameraPose.py = pos.y
  cameraPose.pz = pos.z
  cameraPose.tx = tgt.x
  cameraPose.ty = tgt.y
  cameraPose.tz = tgt.z
}

type Pose = { pos: [number, number, number]; target: [number, number, number] }

const APPROX_WALL_H = 2.7 // include wall height when fitting the dollhouse view
/** Storey height used by ORBIT-SHELL-CLAMP when a plan carries no explicit `ceilingHeight`
 *  (matches `apartment/constants.ts`'s 2.6 m for the default flat). */
const FLOOR_TO_CEILING_FALLBACK = 2.6
const REF_FOV_DEG = 45 // Canvas perspective FOV — the reference lens for ortho fits

/** Plan footprint (width, depth). Shared with the `CommentPins`/`TapeMeasure`
 *  click planes, which used the bare constants and so under-covered the deepest
 *  templates (PLAN-EXTENT). */
const planExtents = planExtent

/** Camera distance at which a sphere of `radius` exactly fills the smaller of the
 *  vertical / horizontal field of view — so the framing fits any viewport aspect
 *  ratio (portrait phones included). Thin wrapper over the shared, unit-tested
 *  `fitDistanceForFov` (frameSelection.ts); takes an explicit FOV + aspect so the
 *  same framing math works whether the live camera is perspective or the swapped-
 *  in orthographic one (which has no `.fov`). */
function fitDistance(radius: number, fovRad: number, aspect: number): number {
  return fitDistanceForFov(radius, fovRad, aspect || 1)
}

/** 3/4 dollhouse framing for the active plan, sized to the viewport so the whole
 *  flat just fills the view — dynamic for both the default flat and custom plans
 *  and any window aspect ratio. */
function dollhouseFraming(plan: FloorPlan, fovRad: number, aspect: number): Pose {
  const [pw, pd] = planExtents(plan)
  const cx = pw / 2
  const cz = pd / 2
  // Bounding-sphere radius of the footprint + a little wall height, with margin.
  const radius = 0.5 * Math.hypot(pw, pd, APPROX_WALL_H) * 1.1
  const dist = fitDistance(radius, fovRad, aspect)
  // Unit 3/4 direction (equal X/Z, lower Y for a dollhouse look).
  const inv = 1 / Math.hypot(0.82, 0.6, 0.82)
  const dx = 0.82 * inv
  const dy = 0.6 * inv
  const dz = 0.82 * inv
  return { pos: [cx + dx * dist, dy * dist, cz + dz * dist], target: [cx, 1.0, cz] }
}

/** Overhead top-down framing for the active plan: centred, at a height that makes
 *  the whole footprint just fill the viewport (honours aspect ratio). The tiny +Z
 *  keeps OrbitControls out of gimbal lock at the pole. */
function topFraming(plan: FloorPlan, fovRad: number, aspect: number): Pose {
  const [pw, pd] = planExtents(plan)
  const cx = pw / 2
  const cz = pd / 2
  const asp = aspect || 1
  const margin = 1.12
  const half = Math.tan(fovRad / 2)
  // Looking straight down: screen-vertical maps to world depth, screen-horizontal
  // to world width. Height must satisfy both.
  const hForDepth = ((pd / 2) * margin) / half
  const hForWidth = ((pw / 2) * margin) / (half * asp)
  const h = Math.max(hForDepth, hForWidth, 4)
  return { pos: [cx, h, cz + 0.01], target: [cx, 0, cz] }
}

export function OrbitCamera() {
  // The orbit camera is frozen only while directly manipulating furniture (an
  // item drag or a rotate-gizmo gesture) so the gesture doesn't also spin the
  // view — camera and editing now share the orbit camera in the room editor.
  // Click-drag on empty space always orbits; nothing is "select mode" anymore.
  const draggingItemId = useStore((s) => s.draggingItemId)
  const rotatingGizmo = useStore((s) => s.rotatingGizmo)
  // Also frozen while a catalog placement is armed (`activeDefId`) so dragging a
  // freshly-picked piece around to position it — especially a one-finger drag on
  // touch — never doubles as an orbit gesture that spins the view.
  const placingActive = useStore((s) => s.activeDefId != null)
  // Bug #6: on mobile, any open overlay (catalog / inspector / finish / wall
  // accent bottom-sheet) or modal floats OVER the canvas — a swipe on it must
  // not also pan/orbit the view behind it. Freeze the camera while one is up so
  // interacting with a component never leaks to the scene. (Desktop keeps
  // orbiting with a docked side panel open — those don't cover the canvas.)
  const isMobile = useIsMobile()
  const anyModalOpen = useAnyModalOpen()
  const overlayOpen = useStore(
    (s) =>
      s.catalogOpen ||
      s.selectedItemId != null ||
      s.selectedItemIds.length > 0 ||
      s.selectedRoomId != null ||
      s.selectedWall != null,
  )
  const uiBlockingCamera = isMobile && (anyModalOpen || overlayOpen)
  const controlsEnabled = !draggingItemId && !rotatingGizmo && !placingActive && !uiBlockingCamera
  const autoRotate = useStore((s) => s.autoRotate)
  const { camera, gl, scene } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const roomEditorId = useStore((s) => s.roomEditor.roomId)

  // ORBIT-SHELL-CLAMP: the storey envelope the camera must stay outside of, memoised on the
  // plan so an edited footprint / ceiling height re-sizes it without re-deriving `planExtent`
  // every frame. `invalidate` is needed because the Canvas is `frameloop="demand"`: an eased
  // push-out must keep requesting frames or it freezes half-way out of the wall.
  const floorPlan = useStore((s) => s.floorPlan)
  const invalidate = useThree((s) => s.invalidate)
  const ceilingH = floorPlan.ceilingHeight ?? FLOOR_TO_CEILING_FALLBACK
  const shellBox = useMemo(() => {
    const [pw, pd] = planExtents(floorPlan)
    return shellBoxForPlan(pw, pd, floorPlan.ceilingHeight ?? FLOOR_TO_CEILING_FALLBACK)
  }, [floorPlan])

  // Parallel-projection / orthographic "dollhouse" view (R3-FEAT-3). A whole-flat
  // overview feature only: the per-room editor frames its own room and stays
  // perspective, so gate ortho off whenever a room is being edited (entering a
  // room reverts to perspective, exiting restores ortho). Also gated by the pro
  // flag so it's off in Simple mode.
  const fParallel = useFeature('parallelProjection')
  const parallelProjectionOn = useStore((s) => s.parallelProjection)
  const ortho = parallelProjectionOn && fParallel && !roomEditorId
  const orthoRef = useRef<OrthographicCamera>(null)

  // Live handle on the current default camera (perspective, or the swapped-in
  // ortho) so the nonce-driven fly effects read the ACTIVE camera without
  // re-subscribing to it — a projection swap changes `camera`, but those effects
  // must fire only on their own nonce, never re-frame on the swap itself.
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  // The Canvas's perspective camera, captured whenever it's the active default
  // (i.e. while not ortho) so the swap can read its FOV + restore its pose.
  const perspCamRef = useRef<PerspectiveCamera | null>(null)
  if (camera instanceof PerspectiveCamera) perspCamRef.current = camera

  // The `makeDefault` OrbitControls registers itself on the R3F store once
  // mounted; this reactive read (unlike the imperative `controlsRef`) lets the
  // framing effect below RE-RUN the moment the controls attach — so the FIRST
  // room entered is framed too, not just later room switches (the controls ref
  // can still be null on the effect's initial mount run, which silently skipped
  // the default framing before). It also fires on a projection swap (drei
  // re-creates the controls when the default camera changes), which the
  // swap-continuity effect below keys on.
  const attachedControls = useThree((s) => s.controls) as OrbitControlsImpl | null

  // Apply the orthographic `zoom` that reproduces a would-be perspective framing
  // at the given pose (no-op unless the live camera is ortho). Held in a ref +
  // refreshed each render — like `startFly` below — so effects see the live
  // closure without listing it as a dependency. Since ortho projection ignores
  // camera distance, every "fly to a framing" also has to translate that framing
  // distance into a `zoom` or the ortho view wouldn't change scale at all.
  const applyOrthoZoom = useRef<(pos: Pose['pos'], target: Pose['target']) => void>(() => {})
  applyOrthoZoom.current = (pos, target) => {
    const cam = cameraRef.current
    if (!(cam instanceof OrthographicCamera)) return
    const heightPx = gl.domElement.clientHeight || 1
    const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
    const d = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2])
    cam.zoom = orthoZoomForPerspective(d, fovRad, heightPx)
    cam.updateProjectionMatrix()
  }

  // Frame the room / whole-flat overview on FIRST controls attach and on a
  // genuine room switch — never merely because a projection swap re-created the
  // controls (`attachedControls` also changes then, but that path preserves the
  // viewpoint itself via the swap-continuity effect below). A `framedRef` guard
  // distinguishes the two so a perspective↔ortho toggle doesn't yank the camera
  // back to the dollhouse default. Reads the plan fresh (not a dep) so a plain
  // plan edit never yanks the camera; always runs in a perspective context
  // (ortho is gated off in the room editor, and the first overview frame happens
  // at boot before any toggle).
  const framedRef = useRef<{
    done: boolean
    room: string | null
    /** Aspect the current framing was solved for, and the pose it produced —
     *  both needed to decide whether a later resize should re-fit (ASPECT-REFRAME). */
    aspect: number
    pos: [number, number, number] | null
    target: [number, number, number] | null
  }>({ done: false, room: null, aspect: 0, pos: null, target: null })
  const frameNow = useCallback(
    (force = false) => {
      const c = controlsRef.current ?? attachedControls
      if (!c) return
      const room = roomEditorId ?? null
      if (!force && framedRef.current.done && framedRef.current.room === room) return
      const cam = cameraRef.current
      const heightPx = gl.domElement.clientHeight || 1
      const widthPx = gl.domElement.clientWidth || 1
      const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
      const aspect = widthPx / heightPx
      const plan = useStore.getState().floorPlan
      if (room) {
        const editorShell = getRoomEditorShell(plan, room)
        if (!editorShell) return
        const [cx, cz] = editorShell.shell.center
        const r = Math.max(editorShell.shell.radius, 1.5)
        // Orbit pivots about the room's true 3D centre (footprint centre at
        // mid-wall height), so the room sits centred on screen and the turntable
        // spins around it rather than a floor-level point that biases it high.
        const midH = APPROX_WALL_H / 2
        c.target.set(cx, midH, cz)
        // Fit the whole room (footprint + wall height) to the viewport so it fills
        // the dollhouse view on load — aspect-aware (portrait phones fit to width),
        // with a small margin so it isn't edge-to-edge.
        const radius = Math.hypot(r, midH) * 1.04
        const dist = fitDistance(radius, fovRad, aspect)
        const inv = 1 / Math.hypot(0.82, 0.6, 0.82)
        cam.position.set(cx + 0.82 * inv * dist, midH + 0.6 * inv * dist, cz + 0.82 * inv * dist)
        c.update()
        framedRef.current = {
          done: true,
          room,
          aspect,
          pos: cam.position.toArray() as [number, number, number],
          target: c.target.toArray() as [number, number, number],
        }
        return
      }
      // Dollhouse overview framed to fit the active plan in the current viewport.
      const { pos, target } = dollhouseFraming(plan, fovRad, aspect)
      cam.position.set(...pos)
      c.target.set(...target)
      c.update()
      // If we booted straight into (or exited a room back into) parallel
      // projection, translate this framing distance into the ortho zoom — the
      // ortho camera ignores distance, so without this the persisted-ortho boot
      // would keep its seed zoom instead of fitting the flat.
      applyOrthoZoom.current(pos, target)
      framedRef.current = {
        done: true,
        room,
        aspect,
        pos: cam.position.toArray() as [number, number, number],
        target: c.target.toArray() as [number, number, number],
      }
    },
    [roomEditorId, attachedControls, gl],
  )

  useEffect(() => {
    frameNow()
  }, [frameNow])

  /**
   * ASPECT-REFRAME. The framing above solves for the viewport it ran in and never
   * re-runs on resize, which CLIPS the flat on a phone rotation: framed at 844x390
   * then rotated to 390x844, the plan spanned 191% of the viewport width with whole
   * rooms cut off both edges (`scripts/dev-probes/phone-view.mjs`). Re-fit — but only
   * when BOTH hold, or the cure is worse than the disease:
   *   · the aspect changed MATERIALLY (a ratio, not a pixel — a window drag fires
   *     continuously and must not re-frame), and
   *   · the camera is still exactly where auto-framing put it, so a deliberate zoom
   *     or pan is never yanked away. Any user gesture disqualifies the re-fit until
   *     the next explicit frame request.
   */
  const size = useThree((s) => s.size)
  useEffect(() => {
    const c = controlsRef.current ?? attachedControls
    const cam = cameraRef.current
    const f = framedRef.current
    if (!c || !cam || !f.done || !f.pos || !f.target) return
    const aspect = (size.width || 1) / (size.height || 1)
    if (!aspectChangedMaterially(f.aspect, aspect)) return
    if (!poseIsStillFramed(cam.position.toArray(), c.target.toArray(), f.pos, f.target)) return
    frameNow(true)
  }, [size, frameNow, attachedControls])

  /**
   * ORBIT-ROTATE-ISOTROPIC + RESIZE-RESEED (finding R2) — the two halves of "a phone
   * orientation swap must not teleport the camera".
   *
   * `rotateSpeed` is written IMPERATIVELY rather than passed as a `<OrbitControls>` prop,
   * because the second half below has to drop it to zero for exactly one pointer move and
   * a re-render would otherwise reassert the prop mid-gesture.
   *
   * 1. **Isotropic gain.** `cameras/orbitTouchGestures.ts:orbitRotateSpeed` compensates
   *    three's height-only normalisation so a fixed-pixel drag rotates the same amount in
   *    either orientation (its docstring carries the measurement and why the LONGER
   *    dimension is the right normaliser).
   * 2. **The first pointer delta after a resize is discarded.** A viewport swap reflows the
   *    layout UNDER a finger that is still down, so the next pointer position is a new
   *    place on a new layout, not a continuation of the gesture — three-stdlib's
   *    `handleTouchMoveRotate` nonetheless subtracts it from the pre-resize `rotateStart`
   *    and rotates by the whole jump. `orbit-phone-orientation-mid-gesture` does exactly
   *    this by construction (`hold: true`, then a 300 px jump), which is why the isotropy
   *    fix alone only took it from FLASH 7 to FLASH 3: halving the gain halves the bogus
   *    rotation, it does not remove it. Zeroing `rotateSpeed` for that ONE move makes
   *    three's own `rotateStart.copy(rotateEnd)` re-seed at the new position while rotating
   *    by nothing — i.e. the delta is ignored, not deferred, using only public API and
   *    without reaching into the controls' private state. `panSpeed` gets the same
   *    treatment for the same reason (a two-finger pan is equally discontinuous across a
   *    reflow); dolly is left alone because its delta is a RATIO of two touch distances,
   *    which a resize does not displace.
   *
   * The suppression is armed on every `size` change and disarmed by the next pointer event of
   * any kind, so at most ONE move is ever affected. `size` has an initial value, so MOUNT arms
   * it too — deliberately: the session's first pointer-move is the other case with no
   * trustworthy start position, and it measurably was one. Before this, the phone arm's very
   * first horizontal drag dropped the camera from the dollhouse height (y 21.56) to y 3.2, a
   * pitch change a purely horizontal drag cannot legitimately produce; afterwards the same
   * drag leaves height exactly constant. Cost is one ~16 ms frame of gesture, once.
   */
  const reseedArmedRef = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arms on every size change by design; `size` is the trigger, not a value read here.
  useEffect(() => {
    reseedArmedRef.current = true
  }, [size])
  useEffect(() => {
    const c = controlsRef.current ?? attachedControls
    const dom = gl.domElement
    if (!c) return
    const liveRotate = () => orbitRotateSpeed(size.width, size.height)
    c.rotateSpeed = liveRotate()
    let suppressed = false
    const restore = () => {
      if (!suppressed) return
      suppressed = false
      c.rotateSpeed = liveRotate()
      // Matches the `panSpeed` prop on <OrbitControls> below; kept in sync by hand because
      // three has no "read the configured value" accessor to restore from.
      c.panSpeed = 1
    }
    const onMove = () => {
      // Order matters: restore FIRST, so the move after the suppressed one is normal even
      // if several arrive before any other pointer event.
      if (suppressed) {
        restore()
        return
      }
      if (!reseedArmedRef.current) return
      reseedArmedRef.current = false
      suppressed = true
      c.rotateSpeed = 0
      c.panSpeed = 0
    }
    const onOther = () => {
      reseedArmedRef.current = false
      restore()
    }
    // Capture phase on the canvas runs before three's own `pointermove` listener, which it
    // registers on `domElement.ownerDocument` in the bubble phase.
    dom.addEventListener('pointermove', onMove, { capture: true, passive: true })
    for (const t of ['pointerdown', 'pointerup', 'pointercancel'])
      dom.addEventListener(t, onOther, { capture: true, passive: true })
    return () => {
      restore()
      dom.removeEventListener('pointermove', onMove, { capture: true })
      for (const t of ['pointerdown', 'pointerup', 'pointercancel'])
        dom.removeEventListener(t, onOther, { capture: true })
    }
  }, [gl, size, attachedControls])

  // Projection-swap continuity (R3-FEAT-3). drei's <OrbitControls> re-creates its
  // internal controls instance whenever the default camera changes (its useMemo
  // is keyed on the camera), which resets the pivot to the origin — so on every
  // perspective↔ortho swap we restore the live pivot + match the new camera's
  // pose to the outgoing one, preserving the viewpoint with no jump. Keyed on
  // `attachedControls` so it runs once the recreated controls have registered as
  // default, before the first frame's OrbitControls.update() (no origin flash).
  // The FIRST attach (prev === null) is skipped — the framing effect owns that.
  const prevAttachedRef = useRef<OrbitControlsImpl | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs only on a controls-instance (camera) swap; pose/size reads are point-in-time.
  useLayoutEffect(() => {
    const c = attachedControls
    const prev = prevAttachedRef.current
    prevAttachedRef.current = c
    if (!c || !prev || c === prev) return
    const cam = cameraRef.current
    const heightPx = gl.domElement.clientHeight || 1
    const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
    // Outgoing pose (pivot + camera position) is mirrored into `cameraPose` every
    // frame by the main useFrame below, so it's the live view at the swap instant.
    const tx = cameraPose.tx
    const ty = cameraPose.ty
    const tz = cameraPose.tz
    const dirX = cameraPose.px - tx
    const dirY = cameraPose.py - ty
    const dirZ = cameraPose.pz - tz
    const oldDist = Math.hypot(dirX, dirY, dirZ) || 1
    c.target.set(tx, ty, tz)
    cam.up.set(0, 1, 0)
    if (cam instanceof OrthographicCamera) {
      // → orthographic: keep the same camera position + match the on-screen scale
      // at the pivot so the toggle doesn't zoom.
      cam.position.set(cameraPose.px, cameraPose.py, cameraPose.pz)
      cam.zoom = orthoZoomForPerspective(oldDist, fovRad, heightPx)
      cam.updateProjectionMatrix()
    } else if (cam instanceof PerspectiveCamera && orthoRef.current) {
      // → perspective: convert the outgoing ortho zoom back into a viewing
      // distance (same direction) so a zoomed-in ortho view maps to an equally-
      // close perspective view.
      const newDist = perspectiveDistanceForOrthoZoom(orthoRef.current.zoom, fovRad, heightPx)
      const inv = newDist / oldDist
      cam.position.set(tx + dirX * inv, ty + dirY * inv, tz + dirZ * inv)
      cam.updateProjectionMatrix()
    }
    c.update()
    writePose(cam.position, c.target)
  }, [attachedControls])

  // Snap to a top-down plan view when requested from the toolbar (fit to viewport).
  // In the per-room editor, frame the isolated room from straight overhead (its
  // centre + a fit height sized to the room) rather than the whole plan — this is
  // also what the mobile "pick up a piece" long-press triggers so placement drops
  // onto a clean plan view. Works in ortho too (fly the angle, set the zoom).
  const topViewNonce = useStore((s) => s.topViewNonce)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires only on the top-view nonce; size reads are snapshotted, not deps.
  useEffect(() => {
    if (topViewNonce === 0) return
    const heightPx = gl.domElement.clientHeight || 1
    const widthPx = gl.domElement.clientWidth || 1
    const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
    const aspect = widthPx / heightPx
    const plan = useStore.getState().floorPlan
    if (roomEditorId) {
      const editorShell = getRoomEditorShell(plan, roomEditorId)
      if (editorShell) {
        const [cx, cz] = editorShell.shell.center
        const r = Math.max(editorShell.shell.radius, 1.5)
        const h = Math.max(fitDistance(r * 1.12, fovRad, aspect), 4)
        const pos: Pose['pos'] = [cx, h, cz + 0.01]
        const target: Pose['target'] = [cx, 0, cz]
        startFly.current(pos, target)
        applyOrthoZoom.current(pos, target)
        return
      }
    }
    const { pos, target } = topFraming(plan, fovRad, aspect)
    startFly.current(pos, target)
    applyOrthoZoom.current(pos, target)
  }, [topViewNonce, roomEditorId])

  // "Reset view" → snap back to a 3/4 dollhouse overview that fits the viewport.
  const homeViewNonce = useStore((s) => s.homeViewNonce)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires only on the reset-view nonce; size reads are snapshotted, not deps.
  useEffect(() => {
    if (homeViewNonce === 0) return
    const heightPx = gl.domElement.clientHeight || 1
    const widthPx = gl.domElement.clientWidth || 1
    const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
    const { pos, target } = dollhouseFraming(
      useStore.getState().floorPlan,
      fovRad,
      widthPx / heightPx,
    )
    startFly.current(pos, target)
    applyOrthoZoom.current(pos, target)
  }, [homeViewNonce])

  // Double-click an item → smoothly re-target the orbit pivot onto it and
  // dolly in to a comfortable framing distance (keeps the current view angle).
  const focusNonce = useStore((s) => s.focusNonce)
  useEffect(() => {
    if (focusNonce === 0) return
    const c = controlsRef.current
    const cam = cameraRef.current
    const p = useStore.getState().focusPoint
    if (!c || !p) return
    const dest = new Vector3(p[0], 0.6, p[1])
    const offset = cam.position.clone().sub(c.target)
    const dist = offset.length()
    const targetDist = Math.min(dist, 4.5) // dolly in if far
    offset.setLength(targetDist)
    const destPos = dest.clone().add(offset)
    // Eased re-target onto the item (keeps the current view angle) rather than a
    // hard snap — the comment always promised "smoothly", now it actually glides.
    const pos: Pose['pos'] = [destPos.x, destPos.y, destPos.z]
    const target: Pose['target'] = [dest.x, dest.y, dest.z]
    startFly.current(pos, target)
    applyOrthoZoom.current(pos, target)
  }, [focusNonce])

  // Frame selection (FEAT-A, "Z" or the NavCluster button) → dolly/retarget so
  // the selection's world bounds fill the view. Keeps the current orbit angle
  // (the offset direction from target to camera), only changing target +
  // distance — same "re-target without resetting the view" feel as the
  // double-click focus above, but distance is FIT to the selection's real
  // bounding sphere (via the shared fitDistanceForFov) rather than a fixed
  // dolly-in clamp, so a big wardrobe frames wider than a side table.
  const frameNonce = useStore((s) => s.frameNonce)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires only on the frame-selection nonce; camera/controls/size read live, not deps.
  useEffect(() => {
    if (frameNonce === 0) return
    const c = controlsRef.current
    const cam = cameraRef.current
    const bounds = useStore.getState().frameBounds
    if (!c || !bounds) return
    const heightPx = gl.domElement.clientHeight || 1
    const widthPx = gl.domElement.clientWidth || 1
    const fovRad = ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180
    const distance = clampOrbitDistance(
      fitDistanceForFov(bounds.radius * FRAME_MARGIN, fovRad, widthPx / heightPx || 1),
    )
    const dest = new Vector3(...bounds.center)
    const offset = cam.position.clone().sub(c.target)
    // Degenerate offset (camera sitting exactly on the target) → fall back to
    // the same 3/4 dollhouse direction used everywhere else in this file.
    if (offset.lengthSq() < 1e-6) offset.set(0.82, 0.6, 0.82)
    offset.setLength(distance)
    const destPos = dest.clone().add(offset)
    const pos: Pose['pos'] = [destPos.x, destPos.y, destPos.z]
    const target: Pose['target'] = [dest.x, dest.y, dest.z]
    startFly.current(pos, target)
    applyOrthoZoom.current(pos, target)
  }, [frameNonce])

  // Eased camera fly — shared by every retarget (saved view, focus, top, home)
  // so the camera glides rather than teleporting. `dur` is distance-aware
  // (`flyDurationFor`): a short hop snaps, a long jump across the flat glides.
  const fly = useRef<{
    fromPos: Vector3
    fromTgt: Vector3
    toPos: Vector3
    toTgt: Vector3
    t: number
    dur: number
  } | null>(null)
  // Start an eased fly from the live pose to a destination pose+target. Reused by
  // all the retarget effects below; keeps the per-frame tween in one place. Held
  // in a ref and refreshed each render so effects/useFrame see the live closure.
  const startFly = useRef<(toPos: Pose['pos'], toTgt: Pose['target']) => void>(() => {})
  startFly.current = (toPos, toTgt) => {
    const c = controlsRef.current
    if (!c) return
    fly.current = {
      fromPos: camera.position.clone(),
      fromTgt: c.target.clone(),
      toPos: new Vector3(...toPos),
      toTgt: new Vector3(...toTgt),
      t: 0,
      dur: flyDurationFor([camera.position.x, camera.position.y, camera.position.z], toPos),
    }
    // Dev-only fly probe: sweep the fly's actual interpolation curve (the same
    // flyPose + lookAt semantics the per-frame tick uses) at a fixed 120-sample
    // resolution and publish the swept quaternions on `window.__flyProbe`, so
    // the smoothness scenario (scripts/scenarios/top-view-smooth.json) can
    // assert the per-step angular delta deterministically — a headless
    // software-rendered browser may paint so few real frames that a single
    // tick's dt covers the whole fly. Tree-shaken from prod by the DEV guard.
    if (import.meta.env.DEV) {
      const from: Pose['pos'] = [camera.position.x, camera.position.y, camera.position.z]
      const fromT: Pose['target'] = [c.target.x, c.target.y, c.target.z]
      const scratch = camera.clone()
      const samples: { t: number; x: number; y: number; z: number; w: number }[] = []
      const steps = 120
      for (let i = 0; i <= steps; i++) {
        const f = smooth(i / steps)
        const { pos, target } = flyPose(from, fromT, toPos, toTgt, f)
        scratch.position.set(pos[0], pos[1], pos[2])
        scratch.up.copy(camera.up)
        scratch.lookAt(target[0], target[1], target[2])
        const q = scratch.quaternion
        samples.push({ t: i / steps, x: q.x, y: q.y, z: q.z, w: q.w })
      }
      ;(window as unknown as { __flyProbe?: unknown[] }).__flyProbe = samples
    }
  }
  const applyViewNonce = useStore((s) => s.applyViewNonce)
  useEffect(() => {
    if (applyViewNonce === 0) return
    const pose = useStore.getState().pendingViewPose
    if (!pose) return
    startFly.current(pose.pos, pose.target)
    applyOrthoZoom.current(pose.pos, pose.target)
  }, [applyViewNonce])

  // Automated walkthrough tour: fly the camera through a sequence of per-room
  // dollhouse framings (one loop), then stop + end any recording. Controls are
  // disabled while touring so it doesn't fight the animation.
  const tour = useRef<{
    frames: (Framing & { lighting?: ViewTourFrame })[]
    t: number
    rate?: number
    lastLeg?: number
  } | null>(null)
  // Tour/sweep cleanup normally lives in the frame loop's `else if
  // (tour.current)` branch — but that only runs while THIS component renders.
  // Switching to walk mode mid-tour unmounts OrbitCamera (CameraRig swaps the
  // camera component), which used to orphan `touring` (RenderPump renders
  // continuously forever) and `timeSweepRestore` (the day→night sweep never
  // restores the clock), and a later return to orbit restarted the whole tour
  // from scratch. Unmounting mid-tour now ends the tour + restores time.
  useEffect(
    () => () => {
      if (!tour.current) return
      tour.current = null
      const st = useStore.getState()
      if (st.touring) st.setTouring(false)
      st.endTimeSweep()
    },
    [],
  )
  useFrame((_, dt) => {
    const c = controlsRef.current
    if (!c) return

    // An eased fly (saved view / focus / top / home) overrides manual control
    // until it completes; duration is distance-aware (flyDurationFor).
    if (fly.current) {
      fly.current.t = Math.min(1, fly.current.t + dt / fly.current.dur)
      const f = smooth(fly.current.t)
      // Spherical (orbit-relative) interpolation, not a raw Cartesian lerp —
      // see TV-SNAP in cameraTween.ts. A straight-line position/target lerp
      // implies an unstable, discontinuous azimuth right as the destination
      // approaches straight-overhead (top view), which OrbitControls' internal
      // lookAt then renders as a violent rotational snap on the final frame(s).
      const { pos, target } = flyPose(
        [fly.current.fromPos.x, fly.current.fromPos.y, fly.current.fromPos.z],
        [fly.current.fromTgt.x, fly.current.fromTgt.y, fly.current.fromTgt.z],
        [fly.current.toPos.x, fly.current.toPos.y, fly.current.toPos.z],
        [fly.current.toTgt.x, fly.current.toTgt.y, fly.current.toTgt.z],
        f,
      )
      camera.position.set(pos[0], pos[1], pos[2])
      c.target.set(target[0], target[1], target[2])
      c.update()
      if (fly.current.t >= 1) fly.current = null
      // Keep the live pose singleton current even mid-fly.
      writePose(camera.position, c.target)
      return
    }

    const touring = useStore.getState().touring
    if (touring) {
      if (!tour.current && touring === 'views') {
        // Cinematic tour through the user's SAVED VIEWS (V-TOUR): authored
        // shots in saved order; each leg applies its destination's captured
        // lighting so a dusk view plays at dusk.
        const vf = viewTourFrames(useStore.getState().savedViews)
        if (!vf) {
          useStore.getState().setTouring(false)
          return
        }
        c.enabled = false
        tour.current = {
          frames: vf.map((f) => ({
            pos: new Vector3(...f.pos),
            tgt: new Vector3(...f.target),
            lighting: f,
          })),
          t: 0,
          // Pace is user-controllable (video duration); fall back to the default.
          rate: 1 / (useStore.getState().viewTourLegSeconds || VIEW_TOUR_LEG_SECONDS),
          lastLeg: -1,
        }
        // Day → night clip sweep (DAY-NIGHT-CLIP): snapshot the current time +
        // pin the clock to the sweep start. No-op unless the toggle is on;
        // while active it drives the clock from tour progress each frame and
        // takes over from each view's captured lighting hour below.
        useStore.getState().beginTimeSweep()
      }
      if (!tour.current) {
        const plan = useStore.getState().floorPlan
        const [bw, bd] = planBounds(plan)
        const aptC = new Vector3(bw / 2, 0, bd / 2)
        const frames: Framing[] = plan.rooms
          .filter((r) => planRoomArea(r) > 2)
          .map((r) => {
            const cx = r.origin[0] + r.width / 2
            const cz = r.origin[1] + r.depth / 2
            const tgt = new Vector3(cx, 0.7, cz)
            const out = new Vector3(cx - aptC.x, 0, cz - aptC.z)
            if (out.lengthSq() < 0.01) out.set(0, 0, -1)
            out.normalize()
            const pos = new Vector3(cx + out.x * 2.6, 4.2, cz + out.z * 2.6)
            return { pos, tgt }
          })
        if (frames.length < 2) {
          useStore.getState().setTouring(false)
          return
        }
        c.enabled = false
        tour.current = { frames, t: 0 }
      }
      const { frames } = tour.current
      const n = frames.length
      tour.current.t += dt * (tour.current.rate ?? 0.4) // room legs ~2.5 s; view legs slower
      if (tour.current.t >= n) {
        c.enabled = true
        tour.current = null
        // Restore the pre-sweep time before ending (no-op if no sweep ran).
        useStore.getState().endTimeSweep()
        useStore.getState().setTouring(false)
        if (useStore.getState().recording) useStore.getState().setRecording(false)
        return
      }
      const t = tour.current.t
      const i = Math.floor(t) % n
      const j = (i + 1) % n
      // Day → night sweep active (DAY-NIGHT-CLIP): drive the clock from overall
      // tour progress (0→1 across all legs) — a no-op when idle. When active it
      // OWNS the time-of-day, so the per-leg captured-hour application below is
      // skipped (the sweep would otherwise fight it each leg change).
      const sweepActive = useStore.getState().timeSweepRestore != null
      if (sweepActive) useStore.getState().applyTimeSweepProgress(t / n)
      // Saved-view legs: apply the destination view's captured lighting as the
      // leg begins, so the scene transitions while the camera flies.
      if (tour.current.lastLeg !== undefined && tour.current.lastLeg !== i) {
        tour.current.lastLeg = i
        const lighting = frames[j].lighting
        if (lighting) {
          const st = useStore.getState()
          if (lighting.lights) st.setLightsMode(lighting.lights)
          if (!sweepActive) {
            if (lighting.mode === 'manual' && typeof lighting.hour === 'number')
              st.setManualHour(lighting.hour)
            else if (lighting.mode === 'system') st.setTimeMode('system')
          }
        }
      }
      const f = smooth(t - Math.floor(t))
      camera.position.lerpVectors(frames[i].pos, frames[j].pos, f)
      c.target.lerpVectors(frames[i].tgt, frames[j].tgt, f)
      c.update()
    } else if (tour.current) {
      tour.current = null
      c.enabled = true
      // Tour stopped externally (Esc / manual stop) mid-sweep → restore time.
      useStore.getState().endTimeSweep()
    }
    // Keep the orbit pivot on/above the floor: panning (shift-wheel or right-drag
    // with screenSpacePanning) can otherwise drag the target below Y=0, after
    // which orbiting dips the camera under the floor. maxPolarAngle then keeps
    // the camera above the (floor-level) target, so the view never goes
    // underground. A 1-frame reconcile via OrbitControls' own damping update.
    if (c.target.y < 0) {
      c.target.y = 0
      if (camera.position.y < 0.05) camera.position.y = 0.05
    }
    // …and not above the ceiling either (ORBIT-SHELL-CLAMP). A pivot lifted into the roof void
    // makes every orbit position a downward one and pulls the camera toward the shell; the
    // dollhouse pivot belongs in the storey it is framing.
    if (c.target.y > ceilingH) c.target.y = ceilingH
    // ORBIT-SHELL-CLAMP (finding S5): keep the camera OUTSIDE the building envelope. Neither
    // `minDistance` (a scalar, 3 m) nor `maxPolarAngle` (just shy of horizontal) knows how big
    // the flat is, so at a short-ish dolly the polar limit parks the camera INSIDE the rooms —
    // measured at target (6.36, 1, 4.69), radius 5.96 m, camera (10.56, 1.09, 8.91), standing
    // in the kitchen with the walls opaque and the near plane slicing them. The reverse drag
    // cannot recover, because at that radius every polar angle is still inside. So the clamp is
    // geometric: push the camera radially out to the padded storey box, eased (`ORBIT_SHELL_TAU`)
    // rather than snapped. Skipped while a tour drives the camera (it owns the pose and disables
    // the controls) and in the room editor, whose shell is one isolated room, deliberately cut
    // away and deliberately looked into from close range.
    if (!tour.current && !roomEditorId) {
      const dest = pushOutsideShell(
        [camera.position.x, camera.position.y, camera.position.z],
        [c.target.x, c.target.y, c.target.z],
        shellBox,
      )
      if (dest) {
        const next = easeShellPush(
          [camera.position.x, camera.position.y, camera.position.z],
          dest,
          dt,
        )
        camera.position.set(next[0], next[1], next[2])
        // OrbitControls re-derives its spherical from `position − target` at the top of every
        // `update()`, so moving the camera here is honoured next frame (radius included) rather
        // than being overwritten by stale internal state.
        c.update()
        invalidate()
      }
    }
    // Publish the live pose every frame so saveCurrentView() can snapshot it.
    writePose(camera.position, c.target)
  })

  // Two-point-perspective / vertical-line-lock (FEAT-D): while on, level the
  // camera's pitch (keep yaw + the OrbitControls target's height reasoning
  // untouched, only the look-at direction is levelled) and apply a vertical
  // projection-matrix shift (`verticalLock.ts`, pure + unit-tested) so wall
  // corners/door frames stay parallel instead of converging — the real-estate-
  // photo "amateur tell" — for shareable hero shots. A separate default-
  // priority `useFrame`, registered after the fly/tour one above, so it always
  // sees this frame's FINAL camera pose (drei's `<OrbitControls>` itself runs
  // its own `update()` at priority -1, before every priority-0 callback).
  // Never touches `camera.position` or `c.target` — only the camera's
  // orientation + projection — so OrbitControls' own spherical bookkeeping
  // (which drives next frame's `update()`) is completely unaffected; the
  // correction simply re-applies, cheaply, every frame it's on. Orthographic
  // projection has no vanishing point to correct, so this cleanly no-ops there
  // (the `instanceof PerspectiveCamera` guard below).
  const verticalLockOn = useStore((s) => s.verticalLock)
  const fTwoPointPerspective = useFeature('twoPointPerspective')
  // Reused view-offset object (per camera instance via ref) so the vertical-lock
  // useFrame mutates one object each frame instead of allocating a fresh 7-field
  // literal every frame while the feature is active (PERF-MAX-4). Only `offsetY`
  // changes frame-to-frame; the rest are constant. `camera.clearViewOffset()` only
  // flips `.enabled` false, so re-asserting `enabled = true` on assign is enough.
  const viewOffset = useRef({
    enabled: true,
    fullWidth: 1,
    fullHeight: 1,
    offsetX: 0,
    offsetY: 0,
    width: 1,
    height: 1,
  })
  useFrame(() => {
    const c = controlsRef.current
    if (!c || !(camera instanceof PerspectiveCamera)) return
    const lockActive = verticalLockOn && fTwoPointPerspective
    const result = lockActive
      ? computeVerticalLock({
          pos: [camera.position.x, camera.position.y, camera.position.z],
          target: [c.target.x, c.target.y, c.target.z],
          fovDeg: camera.fov,
        })
      : null
    if (!result?.active) {
      // Off (or the near-top-down gimbal edge, where there's nothing useful
      // to correct) — fall back cleanly to the normal, unshifted perspective.
      if (camera.view?.enabled) camera.clearViewOffset()
      return
    }
    camera.up.set(0, 1, 0)
    camera.lookAt(result.leveledTarget[0], result.leveledTarget[1], result.leveledTarget[2])
    // Assign the view window directly (rather than `setViewOffset`, which
    // would also stomp `camera.aspect` with `fullWidth/fullHeight` — see
    // `verticalLock.ts`'s doc comment) so the live viewport aspect ratio
    // R3F already maintains on `camera` is left completely alone. Mutate the
    // reused object (PERF-MAX-4) rather than allocating a fresh one each frame.
    const v = viewOffset.current
    v.enabled = true
    v.offsetY = result.offsetY
    camera.view = v
    camera.updateProjectionMatrix()
  })

  // Shift + two-finger trackpad scroll → pan. Wheel events fire in capture
  // phase before OrbitControls' listener so we can swallow them and translate
  // camera + target in screen space ourselves.
  useEffect(() => {
    const dom = gl.domElement
    const xAxis = new Vector3()
    const yAxis = new Vector3()
    const offset = new Vector3()

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return
      const controls = controlsRef.current
      if (!controls) return
      e.preventDefault()
      e.stopPropagation()

      const target = controls.target
      offset.copy(camera.position).sub(target)

      let panScale: number
      if (camera instanceof PerspectiveCamera) {
        const distance = offset.length()
        const halfFov = (camera.fov / 2) * (Math.PI / 180)
        panScale = (2 * distance * Math.tan(halfFov)) / dom.clientHeight
      } else if (camera instanceof OrthographicCamera) {
        // Orthographic pan: one screen pixel maps to 1/zoom world units (the
        // frustum spans the canvas in pixels), independent of distance.
        panScale = 1 / (camera.zoom || 1)
      } else {
        panScale = 1 / dom.clientHeight
      }

      // Macs report deltaX as horizontal scroll; we treat it as horizontal pan
      // so shift+two-finger drag pans in both axes naturally.
      const dxPx = e.deltaX
      const dyPx = e.deltaY

      xAxis.setFromMatrixColumn(camera.matrix, 0) // camera right
      yAxis.setFromMatrixColumn(camera.matrix, 1) // camera up (screen-space pan)

      const panX = xAxis.clone().multiplyScalar(dxPx * panScale)
      const panY = yAxis.clone().multiplyScalar(-dyPx * panScale)
      const pan = panX.add(panY)

      target.add(pan)
      camera.position.add(pan)
      controls.update()
    }

    dom.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      dom.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [camera, gl])

  // ORBIT-TOUCH-GESTURES / N7 (`docs/audit/interaction-sweep-2026-09-18.md`) —
  // defer `beginCameraGesture()` from OrbitControls' `start` (fires on bare
  // `touchstart`/`pointerdown`, before any pixel has moved) to its `change`
  // (fires only once `update()` finds the pose actually moved past its own
  // epsilon). A tap that starts and ends with nothing in between never calls
  // `beginCameraGesture()` at all, so it costs zero DPR toggles. See
  // `orbitTouchGestures.ts`'s header for the full mechanism and why this is a
  // strictly more precise signal than a hand-rolled pixel slop.
  const gestureArmRef = useRef<GestureArmState>(initGestureArmState())
  const onOrbitGestureStart = useCallback(() => {
    gestureArmRef.current = onGestureStart(gestureArmRef.current)
  }, [])
  const onOrbitGestureChange = useCallback(() => {
    const { beginCount, next } = onGestureChange(gestureArmRef.current)
    gestureArmRef.current = next
    for (let i = 0; i < beginCount; i++) beginCameraGesture()
  }, [])
  const onOrbitGestureEnd = useCallback(() => {
    const { endCount, next } = onGestureEnd(gestureArmRef.current)
    gestureArmRef.current = next
    for (let i = 0; i < endCount; i++) endCameraGesture()
  }, [])

  // ORBIT-TOUCH-GESTURES / N7 continued — two touch inputs `<OrbitControls>`
  // has no mapping for, both read from the SAME raw touch listeners (added
  // alongside, not instead of, OrbitControls' own pointer handling — they only
  // ever READ touch coordinates, never `preventDefault`/`stopPropagation`, so
  // the built-in pinch-zoom/two-finger-pan is completely unaffected):
  //  - a two-finger TWIST rotates the azimuth additively (on top of whatever
  //    pan/dolly the built-in DOLLY_PAN handler already does with the same two
  //    touches) — `stepTwistGesture`'s pure onset/stability decision.
  //  - a DOUBLE-TAP eases the orbit pivot onto the tapped point (floor or
  //    furniture), the same `focusOn` the desktop double-click already drives
  //    (`Furniture.tsx`), via a raycast from the tap point with the live camera.
  useEffect(() => {
    const dom = gl.domElement
    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const upAxis = new Vector3(0, 1, 0)
    const twistOffset = new Vector3()

    let twistState: TwistGestureState | null = null
    let tapDown: { x: number; y: number } | null = null
    let lastTap: TapRecord | null = null

    const sampleTwoTouches = (touches: TouchList) => {
      if (touches.length < 2) return null
      const a = touches[0]
      const b = touches[1]
      return {
        angleRad: twoPointAngle(a.clientX, a.clientY, b.clientX, b.clientY),
        distancePx: twoPointDistance(a.clientX, a.clientY, b.clientX, b.clientY),
      }
    }

    const focusFromScreenPoint = (x: number, y: number) => {
      const controls = controlsRef.current
      if (!controls) return
      const rect = dom.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      // Skip invisible render-only helpers that still geometrically intersect —
      // the ORBIT-CEILING occluder plane sits between the camera and the floor
      // for almost any tap into the dollhouse and would otherwise win every
      // time. They render nothing (`colorWrite: false`), the same identifying
      // trait the `interior-shadow.mjs` probe already keys on.
      const hit = hits.find((h) => {
        if (h.distance > FOCUS_RAYCAST_MAX_DISTANCE) return false
        const mat = (h.object as { material?: unknown }).material
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : []
        return !mats.some((m) => (m as { colorWrite?: boolean }).colorWrite === false)
      })
      if (!hit) return
      useStore.getState().focusOn([hit.point.x, hit.point.z])
    }

    const onTouchStart = (e: TouchEvent) => {
      const sample = sampleTwoTouches(e.touches)
      twistState = sample ? initTwistGesture(sample) : null
      if (e.touches.length === 1) {
        const t = e.touches[0]
        tapDown = { x: t.clientX, y: t.clientY }
      } else {
        // A second finger landing mid-tap means this is a multi-touch gesture,
        // not a tap — drop any pending single-tap so it can't later combine
        // with a twist/pinch into a false double-tap.
        tapDown = null
        lastTap = null
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const sample = sampleTwoTouches(e.touches)
      if (!sample) return
      if (!twistState) {
        // A second finger can land without a fresh `touchstart` reaching this
        // element first in some event orderings — seed lazily rather than wait
        // for the next `touchstart`.
        twistState = initTwistGesture(sample)
        return
      }
      const { rotationRad, next } = stepTwistGesture(twistState, sample)
      twistState = next
      if (!rotationRad) return
      const controls = controlsRef.current
      if (!controls) return
      const target = controls.target
      // Rotate the camera's offset from the pivot about the world +Y axis —
      // the same axis OrbitControls' own azimuth (`theta`) turns about.
      twistOffset.copy(camera.position).sub(target).applyAxisAngle(upAxis, rotationRad)
      camera.position.copy(target).add(twistOffset)
      controls.update()
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) twistState = null
      if (e.touches.length !== 0) return
      const t = e.changedTouches[0]
      if (!t || !tapDown) {
        tapDown = null
        return
      }
      const moved = Math.hypot(t.clientX - tapDown.x, t.clientY - tapDown.y)
      tapDown = null
      if (moved > TAP_MOVE_SLOP_PX) {
        lastTap = null
        return
      }
      const tap: TapRecord = { x: t.clientX, y: t.clientY, t: performance.now() }
      if (isDoubleTap(lastTap, tap)) {
        lastTap = null
        focusFromScreenPoint(tap.x, tap.y)
        return
      }
      lastTap = tap
    }

    const onTouchCancel = () => {
      twistState = null
      tapDown = null
      lastTap = null
    }

    // Passive + read-only: this listener never calls `preventDefault` and never
    // stops propagation, so OrbitControls' own pointer-event handling on the
    // same touches is untouched.
    dom.addEventListener('touchstart', onTouchStart, { passive: true })
    dom.addEventListener('touchmove', onTouchMove, { passive: true })
    dom.addEventListener('touchend', onTouchEnd, { passive: true })
    dom.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      dom.removeEventListener('touchstart', onTouchStart)
      dom.removeEventListener('touchmove', onTouchMove)
      dom.removeEventListener('touchend', onTouchEnd)
      dom.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [camera, gl, scene])

  // Frozen only during a furniture drag / gizmo gesture (see controlsEnabled);
  // otherwise the camera orbits, zooms, pans and tilts freely. makeDefault is
  // kept so these stay the default camera controls when re-enabled.
  //
  // Parallel projection (R3-FEAT-3): when on, mount a drei <OrthographicCamera
  // makeDefault> — it becomes the default camera (drei restores the perspective
  // one on unmount), OrbitControls re-binds to it reactively, and the swap-
  // continuity effect above preserves the viewpoint. The initial position/zoom
  // props seed it from the live perspective pose so there's no first-frame flash;
  // OrbitControls then drives its `zoom` for pinch/wheel just like a persp dolly.
  return (
    <>
      {ortho ? (
        <DreiOrthographicCamera
          ref={orthoRef}
          makeDefault
          near={0.1}
          far={1000}
          position={[cameraPose.px, cameraPose.py, cameraPose.pz]}
          zoom={orthoZoomForPerspective(
            Math.hypot(
              cameraPose.px - cameraPose.tx,
              cameraPose.py - cameraPose.ty,
              cameraPose.pz - cameraPose.tz,
            ) || 10,
            ((perspCamRef.current?.fov ?? REF_FOV_DEG) * Math.PI) / 180,
            gl.domElement.clientHeight || 1,
          )}
        />
      ) : null}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enabled={controlsEnabled}
        // GPU-STARVE-1: publish rotate/pan/dolly gestures to the camera-motion
        // signal so InteractiveDprController can shed resolution while the
        // camera is driven (High/Maximum frame cost vs the GPU watchdog).
        // ORBIT-TOUCH-GESTURES / N7: `beginCameraGesture()` itself is deferred
        // from `start` to `change` (see the gesture-arm effect above) so a
        // motionless tap never engages the degrade.
        onStart={onOrbitGestureStart}
        onChange={onOrbitGestureChange}
        onEnd={onOrbitGestureEnd}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        enableDamping
        dampingFactor={0.1}
        enablePan
        screenSpacePanning
        panSpeed={1}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }}
        minDistance={3}
        maxDistance={60}
        // Allow a near-overhead angle for layout planning (just shy of straight
        // down to avoid gimbal lock).
        maxPolarAngle={Math.PI / 2 - 0.015}
      />
    </>
  )
}
