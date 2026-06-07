import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MOUSE, PerspectiveCamera, TOUCH, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { APARTMENT_EXT_D, APARTMENT_EXT_W } from '../../apartment/constants'
import { isDefaultPlan } from '../../floorplan/planGeometry'
import { type FloorPlan, planBounds, planRoomArea } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { getRoomEditorShell } from '../roomEditorShell'
import { cameraPose } from './cameraForward'

interface Framing {
  pos: Vector3
  tgt: Vector3
}
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Mirror the live camera pose into the shared singleton (read by saved views). */
function writePose(pos: Vector3, tgt: Vector3): void {
  cameraPose.px = pos.x
  cameraPose.py = pos.y
  cameraPose.pz = pos.z
  cameraPose.tx = tgt.x
  cameraPose.ty = tgt.y
  cameraPose.tz = tgt.z
}

// Stable initial target — passing a fresh array each render makes drei
// re-apply it and clobber any user pan.
const INITIAL_TARGET: [number, number, number] = [APARTMENT_EXT_W / 2, 1.3, APARTMENT_EXT_D / 2]

type Pose = { pos: [number, number, number]; target: [number, number, number] }

/** 3/4 dollhouse framing for the active plan. The built-in flat keeps its exact
 *  hand-tuned pose; a custom plan is framed from its own bounds so "reset view"
 *  and exiting the room editor land on the right place regardless of plan size. */
function dollhouseFraming(plan: FloorPlan): Pose {
  if (isDefaultPlan(plan)) return { pos: [12, 8, 12], target: INITIAL_TARGET }
  const [pw, pd] = planBounds(plan)
  const cx = pw / 2
  const cz = pd / 2
  const d = Math.max(pw, pd, 4)
  return { pos: [cx + d * 0.7, d * 0.7, cz + d * 0.7], target: [cx, 1.0, cz] }
}

/** Overhead top-down framing for the active plan (centre + a height sized to the
 *  plan). The tiny +Z keeps OrbitControls out of gimbal lock at the pole. */
function topFraming(plan: FloorPlan): Pose {
  const isDef = isDefaultPlan(plan)
  const [pw, pd] = isDef ? [APARTMENT_EXT_W, APARTMENT_EXT_D] : planBounds(plan)
  const cx = pw / 2
  const cz = pd / 2
  const h = isDef ? 17 : Math.max(pw, pd) * 1.7
  return { pos: [cx, h, cz + 0.01], target: [cx, 0, cz] }
}

export function OrbitCamera() {
  const editorTool = useStore((s) => s.editorTool)
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
      camera.position.set(cx + r * 1.5, r * 1.7, cz + r * 1.5)
      c.update()
      return
    }
    // Dollhouse overview framed to the active plan (default flat keeps its pose).
    const { pos, target } = dollhouseFraming(plan)
    camera.position.set(...pos)
    controlsRef.current?.target.set(...target)
    controlsRef.current?.update()
  }, [camera, roomEditorId])

  // Snap to a top-down plan view when requested from the toolbar.
  const topViewNonce = useStore((s) => s.topViewNonce)
  useEffect(() => {
    if (topViewNonce === 0) return
    const c = controlsRef.current
    if (!c) return
    const { pos, target } = topFraming(useStore.getState().floorPlan)
    c.target.set(...target)
    camera.position.set(...pos)
    c.update()
  }, [topViewNonce, camera])

  // "Reset view" → snap back to the 3/4 dollhouse overview of the active plan.
  const homeViewNonce = useStore((s) => s.homeViewNonce)
  useEffect(() => {
    if (homeViewNonce === 0) return
    const c = controlsRef.current
    if (!c) return
    const { pos, target } = dollhouseFraming(useStore.getState().floorPlan)
    c.target.set(...target)
    camera.position.set(...pos)
    c.update()
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
    c.target.copy(dest)
    camera.position.copy(dest).add(offset)
    c.update()
  }, [focusNonce, camera])

  // Apply a saved view → smoothly fly the camera to its stored pose + target.
  const fly = useRef<{
    fromPos: Vector3
    fromTgt: Vector3
    toPos: Vector3
    toTgt: Vector3
    t: number
  } | null>(null)
  const applyViewNonce = useStore((s) => s.applyViewNonce)
  useEffect(() => {
    if (applyViewNonce === 0) return
    const c = controlsRef.current
    const pose = useStore.getState().pendingViewPose
    if (!c || !pose) return
    fly.current = {
      fromPos: camera.position.clone(),
      fromTgt: c.target.clone(),
      toPos: new Vector3(...pose.pos),
      toTgt: new Vector3(...pose.target),
      t: 0,
    }
  }, [applyViewNonce, camera])

  // Automated walkthrough tour: fly the camera through a sequence of per-room
  // dollhouse framings (one loop), then stop + end any recording. Controls are
  // disabled while touring so it doesn't fight the animation.
  const tour = useRef<{ frames: Framing[]; t: number } | null>(null)
  useFrame((_, dt) => {
    const c = controlsRef.current
    if (!c) return

    // A saved-view fly overrides manual control until it completes (~0.6 s).
    if (fly.current) {
      fly.current.t = Math.min(1, fly.current.t + dt / 0.6)
      const f = smooth(fly.current.t)
      camera.position.lerpVectors(fly.current.fromPos, fly.current.toPos, f)
      c.target.lerpVectors(fly.current.fromTgt, fly.current.toTgt, f)
      c.update()
      if (fly.current.t >= 1) fly.current = null
      // Keep the live pose singleton current even mid-fly.
      writePose(camera.position, c.target)
      return
    }

    const touring = useStore.getState().touring
    if (touring) {
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
      tour.current.t += dt * 0.4 // ~2.5 s per room leg
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
      const f = smooth(t - Math.floor(t))
      camera.position.lerpVectors(frames[i].pos, frames[j].pos, f)
      c.target.lerpVectors(frames[i].tgt, frames[j].tgt, f)
      c.update()
    } else if (tour.current) {
      tour.current = null
      c.enabled = true
    }
    // Publish the live pose every frame so saveCurrentView() can snapshot it.
    writePose(camera.position, c.target)
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
      if (editorTool !== 'orbit') return
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
  }, [camera, gl, editorTool])

  // In select mode the camera is frozen so click-drag can move furniture
  // (and click-drag on empty space does nothing). makeDefault is kept so
  // the controls are still the default camera controls when re-enabled.
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={editorTool === 'orbit'}
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
      maxDistance={30}
      // Allow a near-overhead angle for layout planning (just shy of straight
      // down to avoid gimbal lock).
      maxPolarAngle={Math.PI / 2 - 0.015}
    />
  )
}
