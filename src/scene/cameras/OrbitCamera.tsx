import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MOUSE, PerspectiveCamera, TOUCH, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../../apartment/constants'
import { useAnyModalOpen } from '../../controls/modalGuard'
import { useFeature } from '../../features/useFeature'
import { isDefaultPlan } from '../../floorplan/planGeometry'
import { type FloorPlan, planBounds, planRoomArea } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { useIsMobile } from '../../ui/useIsMobile'
import { getRoomEditorShell } from '../roomEditorShell'
import { cameraPose } from './cameraForward'
import { flyDurationFor, flyPose, smoothstep as smooth } from './cameraTween'
import { clampOrbitDistance, FRAME_MARGIN, fitDistanceForFov } from './frameSelection'
import { computeVerticalLock } from './verticalLock'
import { VIEW_TOUR_LEG_SECONDS, type ViewTourFrame, viewTourFrames } from './viewTour'

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

/** Plan footprint (width, depth) — the apartment extents for the default flat,
 *  the plan's own bounds otherwise. */
function planExtents(plan: FloorPlan): [number, number] {
  return isDefaultPlan(plan) ? [APARTMENT_EXT_W, APARTMENT_EXT_D] : planBounds(plan)
}

/** Camera distance at which a sphere of `radius` exactly fills the smaller of the
 *  vertical / horizontal field of view — so the framing fits any viewport aspect
 *  ratio (portrait phones included). Thin per-camera wrapper over the shared,
 *  unit-tested `fitDistanceForFov` (frameSelection.ts) so the whole-plan
 *  dollhouse/room/top framings below and the FEAT-A selection framing share
 *  one formula. */
function fitDistance(radius: number, camera: PerspectiveCamera): number {
  return fitDistanceForFov(radius, (camera.fov * Math.PI) / 180, camera.aspect || 1)
}

/** 3/4 dollhouse framing for the active plan, sized to the viewport so the whole
 *  flat just fills the view — dynamic for both the default flat and custom plans
 *  and any window aspect ratio. */
function dollhouseFraming(plan: FloorPlan, camera: PerspectiveCamera): Pose {
  const [pw, pd] = planExtents(plan)
  const cx = pw / 2
  const cz = pd / 2
  // Bounding-sphere radius of the footprint + a little wall height, with margin.
  const radius = 0.5 * Math.hypot(pw, pd, APPROX_WALL_H) * 1.1
  const dist = fitDistance(radius, camera)
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
function topFraming(plan: FloorPlan, camera: PerspectiveCamera): Pose {
  const [pw, pd] = planExtents(plan)
  const cx = pw / 2
  const cz = pd / 2
  const vFov = (camera.fov * Math.PI) / 180
  const aspect = camera.aspect || 1
  const margin = 1.12
  const half = Math.tan(vFov / 2)
  // Looking straight down: screen-vertical maps to world depth, screen-horizontal
  // to world width. Height must satisfy both.
  const hForDepth = ((pd / 2) * margin) / half
  const hForWidth = ((pw / 2) * margin) / (half * aspect)
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
  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const roomEditorId = useStore((s) => s.roomEditor.roomId)

  useEffect(() => {
    // In the per-room editor, frame the isolated room (centre + a 3/4 offset
    // sized to the room) instead of the whole-apartment default. Re-runs on
    // room switch so each room loads framed. Works on custom plans too. The plan
    // is read fresh (not a dep) so a plain plan edit never yanks the camera.
    const plan = useStore.getState().floorPlan
    if (roomEditorId) {
      const c = controlsRef.current
      if (!c) return
      const editorShell = getRoomEditorShell(plan, roomEditorId)
      if (!editorShell) return
      const [cx, cz] = editorShell.shell.center
      const r = Math.max(editorShell.shell.radius, 1.5)
      c.target.set(cx, 1.0, cz)
      if (camera instanceof PerspectiveCamera) {
        // Fit the whole room (footprint + wall height) to the viewport so it just
        // fills the dollhouse view on load — aspect-aware (portrait phones too),
        // mirroring the whole-plan dollhouse framing rather than a fixed multiple.
        const radius = Math.hypot(r, APPROX_WALL_H / 2) * 1.12
        const dist = fitDistance(radius, camera)
        const inv = 1 / Math.hypot(0.82, 0.6, 0.82)
        camera.position.set(cx + 0.82 * inv * dist, 0.6 * inv * dist, cz + 0.82 * inv * dist)
      } else {
        camera.position.set(cx + r * 1.5, r * 1.7, cz + r * 1.5)
      }
      c.update()
      return
    }
    // Dollhouse overview framed to fit the active plan in the current viewport.
    if (camera instanceof PerspectiveCamera) {
      const { pos, target } = dollhouseFraming(plan, camera)
      camera.position.set(...pos)
      controlsRef.current?.target.set(...target)
      controlsRef.current?.update()
    }
  }, [camera, roomEditorId])

  // Snap to a top-down plan view when requested from the toolbar (fit to viewport).
  // In the per-room editor, frame the isolated room from straight overhead (its
  // centre + a fit height sized to the room) rather than the whole plan — this is
  // also what the mobile "pick up a piece" long-press triggers so placement drops
  // onto a clean plan view.
  const topViewNonce = useStore((s) => s.topViewNonce)
  useEffect(() => {
    if (topViewNonce === 0) return
    if (!(camera instanceof PerspectiveCamera)) return
    const plan = useStore.getState().floorPlan
    if (roomEditorId) {
      const editorShell = getRoomEditorShell(plan, roomEditorId)
      if (editorShell) {
        const [cx, cz] = editorShell.shell.center
        const r = Math.max(editorShell.shell.radius, 1.5)
        const h = Math.max(fitDistance(r * 1.12, camera), 4)
        startFly.current([cx, h, cz + 0.01], [cx, 0, cz])
        return
      }
    }
    const { pos, target } = topFraming(plan, camera)
    startFly.current(pos, target)
  }, [topViewNonce, camera, roomEditorId])

  // "Reset view" → snap back to a 3/4 dollhouse overview that fits the viewport.
  const homeViewNonce = useStore((s) => s.homeViewNonce)
  useEffect(() => {
    if (homeViewNonce === 0) return
    if (!(camera instanceof PerspectiveCamera)) return
    const { pos, target } = dollhouseFraming(useStore.getState().floorPlan, camera)
    startFly.current(pos, target)
  }, [homeViewNonce, camera])

  // Double-click an item → smoothly re-target the orbit pivot onto it and
  // dolly in to a comfortable framing distance (keeps the current view angle).
  const focusNonce = useStore((s) => s.focusNonce)
  useEffect(() => {
    if (focusNonce === 0) return
    const c = controlsRef.current
    const p = useStore.getState().focusPoint
    if (!c || !p) return
    const dest = new Vector3(p[0], 0.6, p[1])
    const offset = camera.position.clone().sub(c.target)
    const dist = offset.length()
    const targetDist = Math.min(dist, 4.5) // dolly in if far
    offset.setLength(targetDist)
    const destPos = dest.clone().add(offset)
    // Eased re-target onto the item (keeps the current view angle) rather than a
    // hard snap — the comment always promised "smoothly", now it actually glides.
    startFly.current([destPos.x, destPos.y, destPos.z], [dest.x, dest.y, dest.z])
  }, [focusNonce, camera])

  // Frame selection (FEAT-A, "Z" or the NavCluster button) → dolly/retarget so
  // the selection's world bounds fill the view. Keeps the current orbit angle
  // (the offset direction from target to camera), only changing target +
  // distance — same "re-target without resetting the view" feel as the
  // double-click focus above, but distance is FIT to the selection's real
  // bounding sphere (via the shared fitDistanceForFov) rather than a fixed
  // dolly-in clamp, so a big wardrobe frames wider than a side table.
  const frameNonce = useStore((s) => s.frameNonce)
  useEffect(() => {
    if (frameNonce === 0) return
    const c = controlsRef.current
    const bounds = useStore.getState().frameBounds
    if (!c || !bounds || !(camera instanceof PerspectiveCamera)) return
    const vFov = (camera.fov * Math.PI) / 180
    const distance = clampOrbitDistance(
      fitDistanceForFov(bounds.radius * FRAME_MARGIN, vFov, camera.aspect || 1),
    )
    const dest = new Vector3(...bounds.center)
    const offset = camera.position.clone().sub(c.target)
    // Degenerate offset (camera sitting exactly on the target) → fall back to
    // the same 3/4 dollhouse direction used everywhere else in this file.
    if (offset.lengthSq() < 1e-6) offset.set(0.82, 0.6, 0.82)
    offset.setLength(distance)
    const destPos = dest.clone().add(offset)
    startFly.current([destPos.x, destPos.y, destPos.z], [dest.x, dest.y, dest.z])
  }, [frameNonce, camera])

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
        useStore.getState().setTouring(false)
        if (useStore.getState().recording) useStore.getState().setRecording(false)
        return
      }
      const t = tour.current.t
      const i = Math.floor(t) % n
      const j = (i + 1) % n
      // Saved-view legs: apply the destination view's captured lighting as the
      // leg begins, so the scene transitions while the camera flies.
      if (tour.current.lastLeg !== undefined && tour.current.lastLeg !== i) {
        tour.current.lastLeg = i
        const lighting = frames[j].lighting
        if (lighting) {
          const st = useStore.getState()
          if (lighting.lights) st.setLightsMode(lighting.lights)
          if (lighting.mode === 'manual' && typeof lighting.hour === 'number')
            st.setManualHour(lighting.hour)
          else if (lighting.mode === 'system') st.setTimeMode('system')
        }
      }
      const f = smooth(t - Math.floor(t))
      camera.position.lerpVectors(frames[i].pos, frames[j].pos, f)
      c.target.lerpVectors(frames[i].tgt, frames[j].tgt, f)
      c.update()
    } else if (tour.current) {
      tour.current = null
      c.enabled = true
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
  // correction simply re-applies, cheaply, every frame it's on.
  const verticalLockOn = useStore((s) => s.verticalLock)
  const fTwoPointPerspective = useFeature('twoPointPerspective')
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
    // R3F already maintains on `camera` is left completely alone.
    camera.view = {
      enabled: true,
      fullWidth: 1,
      fullHeight: 1,
      offsetX: 0,
      offsetY: result.offsetY,
      width: 1,
      height: 1,
    }
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
      } else {
        // Orthographic fallback — not currently used but keeps the handler safe.
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

  // Frozen only during a furniture drag / gizmo gesture (see controlsEnabled);
  // otherwise the camera orbits, zooms, pans and tilts freely. makeDefault is
  // kept so these stay the default camera controls when re-enabled.
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={controlsEnabled}
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
  )
}
