import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Euler, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { DOORS, WALLS } from '../../apartment/constants'
import type { RoomId } from '../../apartment/types'
import { type AimSegment, nearestAimedSegment } from '../../collision/aimRay'
import { buildWalkBlockers, resolveCircleVsObbs } from '../../collision/furnitureBlock'
import type { OBB } from '../../collision/obb'
import {
  buildPlanRoomCollisionWalls,
  buildRoomCollisionWalls,
} from '../../collision/roomCollisionWalls'
import { nearestMeasurableHit } from '../../collision/walkMeasureHit'
import { type CollisionWall, isLineOfSightBlocked, resolveMovement } from '../../collision/walls'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { KEYBINDINGS } from '../../controls/keybindings'
import { isAnyModalOpen } from '../../controls/modalGuard'
import { isEditableTarget } from '../../controls/useKeyboard'
import { isFeatureEnabled } from '../../features/featureFlags'
import { roomFloorOffsetM } from '../../floorplan/floorLevels3d'
import {
  GROUND_LEVEL_ID,
  levelAsPlan,
  levelElevation,
  levelOfRoom,
  levelSpawnPoint,
  planLevels,
  walkLevel,
} from '../../floorplan/levels'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { planRoomShell } from '../../floorplan/planRoomShell'
import type { PlanRoom } from '../../floorplan/types'
import { planBounds, planRoomArea, pointInRoom } from '../../floorplan/types'
import { useCatalogGetter } from '../../furniture/catalog'
import { lightAimSegments } from '../../furniture/lightInteract'
import { screenAimSegments } from '../../furniture/screenInteract'
import { windowFixtureAimSegments } from '../../furniture/windowFixtureInteract'
import { useStore } from '../../state/store'
import { getRoomEditorShell } from '../roomEditorShell'
import { resetWalkMove, walkInput } from '../walkInput'
import { clampWalkEyeHeight, WALK_PLAYER_RADIUS } from './walkCameraSettings'
import { _resetWalkMeasureRequest, consumeWalkMeasureRequest } from './walkMeasureRequest'
import { _resetWalkTeleport, consumeWalkTeleport } from './walkTeleport'

const DOOR_SEGMENTS: AimSegment[] = (() => {
  const out: AimSegment[] = []
  for (const d of DOORS) {
    const wall = WALLS.find((w) => w.id === d.wallId)
    if (!wall) continue
    const wdx = wall.end[0] - wall.start[0]
    const wdz = wall.end[1] - wall.start[1]
    const wlen = Math.hypot(wdx, wdz)
    if (wlen === 0) continue
    const ux = wdx / wlen
    const uz = wdz / wlen
    const sx = wall.start[0] + ux * d.offset
    const sz = wall.start[1] + uz * d.offset
    const ex = wall.start[0] + ux * (d.offset + d.width)
    const ez = wall.start[1] + uz * (d.offset + d.width)
    out.push({ id: d.id, sx, sz, segDx: ex - sx, segDz: ez - sz })
  }
  return out
})()

/** Reused scratch array for the merged screen+light aim pass — avoids a
 *  per-`AIM_CHECK_INTERVAL` allocation. Cleared and refilled each check. */
const COMBINED_SCRATCH: AimSegment[] = []

/** Namespaces a segment's id so `nearestAimedSegment` can rank two
 *  interactable categories (screens, lights) in a single pass while still
 *  recovering which category — and the real item id — the winner belongs to.
 *  Exported for `aimCategoryMerge.test.ts`, which verifies the nearest-wins
 *  merge in isolation from the full R3F frame loop. */
export function prefixSegment(prefix: string, seg: AimSegment): AimSegment {
  return { ...seg, id: prefix + seg.id }
}

/** Fallback standing eye-height (m) before the live store value is read. The
 *  user-adjustable height (`walkEyeHeight`, default 1.6) overrides this. */
const EYE_HEIGHT = 1.6
const CROUCH_HEIGHT = 1.05
const CROUCH_RATE = 4.5
const WALK_SPEED = 2.1 // ≈ a relaxed real walking pace (m/s)
const SNEAK_SPEED = 1.0
const BOB_AMPLITUDE = 0.022 // subtle vertical head-bob while walking
const BOB_FREQUENCY = 9.0 // rad/s ≈ ~1.4 steps/s cadence
const JUMP_VELOCITY = 4.2
const GRAVITY = 14
/** Mouse-look sensitivity, radians of turn per pixel of pointer movement. */
const LOOK_SENSITIVITY = 0.0024
/** Touch drag look sensitivity (rad per CSS px) — a touch unit. */
const TOUCH_LOOK_SENSITIVITY = 0.005
/** True on touch-primary devices, where Pointer Lock is unavailable. */
const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
/** Pitch clamp so you can't roll past straight up/down. */
const MAX_PITCH = 1.5
const INTERACT_RADIUS = 2.0
const AIM_CHECK_INTERVAL = 0.1

export function FirstPersonCamera() {
  const { camera, gl, scene } = useThree()
  const pressed = useRef<Record<string, boolean>>({})
  // Drag-to-look orientation (radians). Yaw about world-Y, pitch about local-X.
  const yaw = useRef(0)
  const pitch = useRef(0)
  const doors = useStore((s) => s.doors)
  const floorPlan = useStore((s) => s.floorPlan)
  const roomEditorId = useStore((s) => s.roomEditor.roomId)
  const viewLevelId = useStore((s) => s.viewLevelId)
  // User-adjustable observer camera (Sweet Home 3D parity, PARITY-WALKCAM).
  // FOV applies reactively below; eye-height is ref'd so the frame loop reads
  // the live value and lerps to it (no re-spawn on a slider drag).
  const walkFov = useStore((s) => s.walkFov)
  const walkEyeHeight = useStore((s) => s.walkEyeHeight)
  const eyeHeightRef = useRef(clampWalkEyeHeight(walkEyeHeight))
  eyeHeightRef.current = clampWalkEyeHeight(walkEyeHeight)
  // The storey the walker stands on (F13/ML6c): outside the room editor it
  // follows the View→Levels selection ('all' → ground); inside the editor it
  // is the edited room's own storey — though the editor scene renders at y=0,
  // so only item/wall scoping (not elevation) applies there.
  const walkerLevelId = roomEditorId
    ? (levelOfRoom(floorPlan, roomEditorId)?.id ?? GROUND_LEVEL_ID)
    : walkLevel(floorPlan, viewLevelId).id
  // Walker floor height = the level's elevation (0 in the room editor's
  // unoffset scene). Ref'd so the frame loop reads the live value.
  const floorElev = roomEditorId ? 0 : levelElevation(floorPlan, walkerLevelId)
  const floorElevRef = useRef(floorElev)
  floorElevRef.current = floorElev
  // Floor levels (BSJ-8 follow-up, `floorLevels` flag): the walker's ground
  // height ADDS the current room's FFL offset on top of the storey elevation
  // above, so standing height follows a lowered/raised room continuously as
  // the walker crosses a threshold — a smooth Y follow (not a hard collision
  // step), matching how a real few-cm kerb behaves underfoot. In the isolated
  // room editor the whole walk is scoped to one room, so its single offset is
  // resolved once (mirrors `FurnitureLayer`'s `roomOffsetM` prop) rather than
  // re-scanning per frame; the whole-plan walk resolves per-frame from the
  // walker's live XZ against the walker's OWN storey's rooms.
  const roomEditorOffsetRef = useRef(0)
  const roomsForOffsetRef = useRef<readonly PlanRoom[]>([])
  useEffect(() => {
    if (!isFeatureEnabled('floorLevels') || isDefaultPlan(floorPlan)) {
      roomEditorOffsetRef.current = 0
      roomsForOffsetRef.current = []
      return
    }
    if (roomEditorId) {
      const shell = planRoomShell(floorPlan, roomEditorId)
      roomEditorOffsetRef.current = shell ? roomFloorOffsetM(shell.room, true) : 0
      roomsForOffsetRef.current = []
    } else {
      roomEditorOffsetRef.current = 0
      const level = planLevels(floorPlan).find((l) => l.id === walkerLevelId)
      roomsForOffsetRef.current = level ? level.rooms : []
    }
  }, [floorPlan, roomEditorId, walkerLevelId])
  const collisionWalls = useRef<CollisionWall[]>([])
  // Furniture footprints the walker can't pass through (rebuilt on item change;
  // scoped to the walker's storey — an upstairs bed doesn't block downstairs).
  const items = useStore(useShallow((s) => s.items))
  const { getDef } = useCatalogGetter()
  const blockers = useRef<OBB[]>([])
  useEffect(() => {
    blockers.current = buildWalkBlockers(items, getDef, walkerLevelId)
  }, [items, getDef, walkerLevelId])
  // Curtain/blind aim segments (WINDOW-FIXTURE-INTERACT) — rebuilt whenever
  // items change, like `blockers` above; empty (and never aimed at) while the
  // flag is off, so the interaction is gated at registration, not render.
  const fixtureSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    fixtureSegments.current = isFeatureEnabled('walkWindowFixtures')
      ? windowFixtureAimSegments(items, getDef)
      : []
  }, [items, getDef])
  // Screen (WALK-SCREEN-INTERACT) and light (WALK-LIGHT-INTERACT) aim
  // segments — same rebuild-on-items pattern as the fixture segments above,
  // gated at registration (empty, never aimed at, while its flag is off).
  const screenSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    screenSegments.current = isFeatureEnabled('walkScreens') ? screenAimSegments(items, getDef) : []
  }, [items, getDef])
  const lightSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    lightSegments.current = isFeatureEnabled('walkLights') ? lightAimSegments(items, getDef) : []
  }, [items, getDef])

  useEffect(() => {
    // In the per-room editor, bound the player to the isolated room's clipped
    // walls (default apartment via roomShell; custom plan via planRoomShell).
    // Otherwise walk-mode collision follows the active plan — on multi-storey
    // plans, the WALKER'S level's walls (levelAsPlan), so an upstairs walk
    // collides with upstairs partitions, not the ground floor's (ML6c).
    if (roomEditorId) {
      if (isDefaultPlan(floorPlan)) {
        collisionWalls.current = buildRoomCollisionWalls(roomEditorId as RoomId, doors)
      } else {
        const shell = planRoomShell(floorPlan, roomEditorId)
        collisionWalls.current = shell ? buildPlanRoomCollisionWalls(shell) : []
      }
    } else {
      collisionWalls.current = isDefaultPlan(floorPlan)
        ? buildCollisionWalls(doors)
        : planCollisionWalls(levelAsPlan(floorPlan, walkLevel(floorPlan, viewLevelId)), doors)
    }
  }, [doors, floorPlan, roomEditorId, viewLevelId])

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      // No walking while a modal dialog is open (WASD must not move the
      // camera behind it). keyup still clears, so no key gets stuck held.
      if (isAnyModalOpen()) return
      if (isEditableTarget(e)) return
      pressed.current[e.code] = true
    }
    const onUp = (e: KeyboardEvent) => {
      pressed.current[e.code] = false
    }
    const clearAll = () => {
      pressed.current = {}
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', clearAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clearAll)
    }
  }, [])

  // Look-around input. On touch devices Pointer Lock is unavailable, so a drag
  // on the canvas spins the view (tracked by touch identifier so it's
  // independent of the joystick thumb). On desktop, Pointer Lock is used: click
  // the scene to capture the cursor, then mouse movement spins the view (true
  // FPS spin-on-move) while WASD moves at the same time — independent streams.
  useEffect(() => {
    const dom = gl.domElement
    const clampPitch = (p: number) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p))

    if (IS_COARSE_POINTER) {
      let lookId: number | null = null
      let lastX = 0
      let lastY = 0
      const onTouchStart = (e: TouchEvent) => {
        if (lookId !== null) return
        // A touch that lands on the canvas (not a UI control) becomes the look
        // drag. The joystick stops propagation, so its touches never arrive here.
        const t = e.changedTouches[0]
        if (!t) return
        lookId = t.identifier
        lastX = t.clientX
        lastY = t.clientY
      }
      const onTouchMove = (e: TouchEvent) => {
        if (lookId === null) return
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== lookId) continue
          yaw.current -= (t.clientX - lastX) * TOUCH_LOOK_SENSITIVITY
          pitch.current = clampPitch(pitch.current - (t.clientY - lastY) * TOUCH_LOOK_SENSITIVITY)
          lastX = t.clientX
          lastY = t.clientY
          e.preventDefault()
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === lookId) lookId = null
        }
      }
      dom.addEventListener('touchstart', onTouchStart, { passive: true })
      dom.addEventListener('touchmove', onTouchMove, { passive: false })
      dom.addEventListener('touchend', onTouchEnd)
      dom.addEventListener('touchcancel', onTouchEnd)
      return () => {
        dom.removeEventListener('touchstart', onTouchStart)
        dom.removeEventListener('touchmove', onTouchMove)
        dom.removeEventListener('touchend', onTouchEnd)
        dom.removeEventListener('touchcancel', onTouchEnd)
      }
    }

    const isLocked = () => document.pointerLockElement === dom
    const onClick = () => {
      if (!isLocked()) void dom.requestPointerLock()
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked()) return
      yaw.current -= e.movementX * LOOK_SENSITIVITY
      pitch.current = clampPitch(pitch.current - e.movementY * LOOK_SENSITIVITY)
    }
    const onLockChange = () => {
      // Dropping the lock (Esc) shouldn't leave movement keys "stuck" down.
      if (!isLocked()) pressed.current = {}
      dom.style.cursor = isLocked() ? 'none' : 'grab'
    }
    dom.style.cursor = 'grab'
    dom.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      dom.style.cursor = ''
      dom.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      if (document.pointerLockElement === dom) document.exitPointerLock()
    }
  }, [gl])

  // Dev-only: scenario-harness lever to set/read the walk-mode look pitch
  // directly (IXT-SUITES ceilingDesign rung — "look up to see the ceiling").
  // Real mouse-look needs OS-level Pointer Lock (unavailable headless) and
  // touch-look needs a synthetic multi-touch drag stream on a coarse-pointer
  // profile; both are impractical to drive deterministically from a scenario.
  // This is the minimal, narrowly-scoped lever: it writes the SAME `pitch` ref
  // the frame loop already re-asserts the camera orientation from every frame
  // (see the curtain-interact gotcha in the playbook), so it sticks exactly
  // like a real look-up would, with no other behaviour change.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const clampPitch = (p: number) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p))
    const lever = {
      setPitch: (p: number) => {
        pitch.current = clampPitch(p)
      },
      getPitch: () => pitch.current,
    }
    ;(window as unknown as { __walkLook?: typeof lever }).__walkLook = lever
    return () => {
      delete (window as unknown as { __walkLook?: typeof lever }).__walkLook
    }
  }, [])

  useEffect(() => {
    if (roomEditorId) {
      // Spawn in the centre of the isolated room, looking toward its far edge
      // (default apartment or custom plan). Plan read fresh (not a dep) so a
      // plan edit during walk never re-spawns the player.
      const editorShell = getRoomEditorShell(useStore.getState().floorPlan, roomEditorId)
      const [cx, cz] = editorShell ? editorShell.shell.center : [0, 0]
      const eye = eyeHeightRef.current
      camera.position.set(cx, eye, cz)
      camera.lookAt(cx, eye, cz - 1)
    } else if (isDefaultPlan(useStore.getState().floorPlan)) {
      const eye = eyeHeightRef.current
      camera.position.set(11, eye, 6)
      // Face into the living/dining instead of inheriting the orbit angle.
      camera.lookAt(10.4, eye, 2.5)
    } else {
      const plan = useStore.getState().floorPlan
      const level = walkLevel(plan, viewLevelId)
      if (level.elevation > 0) {
        // Walking an upper storey (View → Levels picked it, ML6c): teleport to
        // that level's first room centre at eye height above ITS floor.
        const sp = levelSpawnPoint(level)
        const [bw, bd] = planBounds(plan)
        const cx = sp?.x ?? bw / 2
        const cz = sp?.z ?? bd / 2
        const span = sp?.span ?? bd
        const eye = level.elevation + eyeHeightRef.current
        camera.position.set(cx, eye, cz + span * 0.32)
        camera.lookAt(cx, eye, cz - span * 0.32)
      } else {
        // Custom plan ground floor: spawn in the largest room (the default
        // flat's hand-tuned living/dining spawn would land outside an arbitrary
        // plan). Stand in the back third looking across the room so the first
        // view shows the space, not a near wall.
        const big = plan.rooms.reduce(
          (a, b) => (a && planRoomArea(a) >= planRoomArea(b) ? a : b),
          plan.rooms[0],
        )
        const [bw, bd] = planBounds(plan)
        const cx = big ? big.origin[0] + big.width / 2 : bw / 2
        const cz = big ? big.origin[1] + big.depth / 2 : bd / 2
        const span = big ? big.depth : bd
        const eye = eyeHeightRef.current
        camera.position.set(cx, eye, cz + span * 0.32)
        camera.lookAt(cx, eye, cz - span * 0.32)
      }
    }
    // Seed drag-to-look yaw/pitch from the spawn orientation so the first drag
    // continues smoothly from where the camera is already pointing.
    const seed = new Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    yaw.current = seed.y
    pitch.current = seed.x
    yPos.current = floorElevRef.current + eyeHeightRef.current
    yVel.current = 0
    groundY.current = floorElevRef.current + eyeHeightRef.current
    return () => {
      useStore.getState().setNearbyDoor(null)
      useStore.getState().setNearbyFixture(null)
      useStore.getState().clearWalkMeasure()
      resetWalkMove()
      _resetWalkTeleport()
      _resetWalkMeasureRequest()
    }
    // viewLevelId is a dep on purpose: picking a storey in View → Levels while
    // walking teleports the walker onto that storey (ML6c).
  }, [camera, roomEditorId, viewLevelId])

  // Apply the user's field-of-view to the live perspective camera, restoring the
  // previous FOV on unmount (exit walk). Reactive to the walkFov slider so a drag
  // visibly widens/narrows the view without re-spawning the walker (PARITY-WALKCAM).
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const prevFov = camera.fov
    camera.fov = walkFov
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = prevFov
      camera.updateProjectionMatrix()
    }
  }, [camera, walkFov])

  const tmpForward = useRef(new Vector3())
  const tmpRight = useRef(new Vector3())
  const lookEuler = useRef(new Euler(0, 0, 0, 'YXZ'))
  // Walk-mode point-to-point measure (WALK-MEASURE): a real scene raycast (not
  // the analytic 2D-segment aim used for doors/fixtures/screens/lights above —
  // "aim at a surface" needs an arbitrary wall/floor/furniture hit, not a
  // pre-registered interactable list). Reused instance + scratch direction
  // vector, matching `FinishDropSurface`'s identical `scene.children` raycast
  // pattern. Kept off the hot path: the continuous live-preview raycast below
  // only ever runs while a measurement is actively being placed (`walkMeasureA`
  // set, `walkMeasureB` not yet), at the same throttled cadence as the door/
  // fixture/screen/light aim checks; the "set point" raycast only runs once
  // per key/button press.
  const measureRaycaster = useRef(new Raycaster())
  const aimDir3D = useRef(new Vector3())
  const aimAccum = useRef(0)
  const yPos = useRef(EYE_HEIGHT)
  const yVel = useRef(0)
  const groundY = useRef(EYE_HEIGHT)
  const bobPhase = useRef(0)
  const bobAmp = useRef(0)

  useFrame((_, dt) => {
    // Minimap tap-to-teleport (MINIMAP-JUMP): a pending request is a world XZ
    // already clamped clear of walls by the minimap's own room-polygon logic
    // (`ui/walk/minimapTeleport.ts`) — this only needs to relocate the camera
    // + face the target room, and nudge off any furniture footprint exactly
    // like a normal step would (`resolveCircleVsObbs`, not a path sweep: a
    // teleport has no "path" to sweep, unlike `resolveMovement` below). Read
    // before the quaternion is set from yaw/pitch so the new facing applies
    // this same frame.
    const teleport = consumeWalkTeleport()
    if (teleport) {
      let landing: [number, number] = [teleport.x, teleport.z]
      if (blockers.current.length > 0) {
        landing = resolveCircleVsObbs(landing[0], landing[1], WALK_PLAYER_RADIUS, blockers.current)
      }
      camera.position.x = landing[0]
      camera.position.z = landing[1]
      yaw.current = teleport.yaw
      pitch.current = 0
    }
    // Apply the drag-to-look orientation, then derive movement from where the
    // camera now points (so strafing/forward track the current heading).
    camera.quaternion.setFromEuler(lookEuler.current.set(pitch.current, yaw.current, 0, 'YXZ'))

    // Walk-mode measure (WALK-MEASURE): a pending "set point" request (the
    // WalkHud button / `walkMeasurePoint` keybinding) is handled immediately —
    // not throttled by `AIM_CHECK_INTERVAL` like the door/fixture/screen/light
    // checks below, so a key press feels instant. Uses the FULL 3D camera
    // forward (unlike `dir` below, flattened to XZ for ground movement).
    const measureRequested = consumeWalkMeasureRequest()
    if (measureRequested && isFeatureEnabled('walkMeasure')) {
      camera.getWorldDirection(aimDir3D.current)
      measureRaycaster.current.set(camera.position, aimDir3D.current)
      // LineSegments2 (the overlay's own drei <Line>) requires Raycaster.camera
      // for its screen-space-width raycast — without it, intersectObjects THROWS
      // once the overlay mounts (after point A), silently killing every later
      // sample (found in real-GPU verification; the overlay itself is then
      // filtered out by nearestMeasurableHit's noExport check).
      measureRaycaster.current.camera = camera
      const hits = measureRaycaster.current.intersectObjects(scene.children, true)
      useStore.getState().cycleWalkMeasurePoint(nearestMeasurableHit(hits))
    }

    const dir = tmpForward.current
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = tmpRight.current.set(-dir.z, 0, dir.x)

    const forward = pressed.current[KEYBINDINGS.walkForward] || pressed.current['ArrowUp']
    const back = pressed.current[KEYBINDINGS.walkBack] || pressed.current['ArrowDown']
    const left = pressed.current[KEYBINDINGS.walkLeft] || pressed.current['ArrowLeft']
    const rightKey = pressed.current[KEYBINDINGS.walkRight] || pressed.current['ArrowRight']
    const joystickMoving = Math.hypot(walkInput.move.x, walkInput.move.y) > 0.01
    const moving = !!(forward || back || left || rightKey) || joystickMoving
    const crouching = !!pressed.current['ShiftLeft'] || !!pressed.current['ShiftRight']
    // Stand on the walker's level's floor: eye/crouch height + its elevation +
    // the current room's FFL offset (BSJ-8 follow-up — 0 when the flag is off
    // or on the default flat). Standing height follows the live user setting
    // (lerped via groundY below).
    const standHeight = Math.max(CROUCH_HEIGHT, eyeHeightRef.current)
    let roomOffset = roomEditorOffsetRef.current
    if (!roomEditorId && roomsForOffsetRef.current.length > 0) {
      for (const r of roomsForOffsetRef.current) {
        if (pointInRoom(r, camera.position.x, camera.position.z)) {
          roomOffset = roomFloorOffsetM(r, true)
          break
        }
      }
    }
    const targetGround =
      floorElevRef.current + roomOffset + (crouching ? CROUCH_HEIGHT : standHeight)
    const dy = targetGround - groundY.current
    const maxStep = CROUCH_RATE * dt
    groundY.current += Math.abs(dy) <= maxStep ? dy : Math.sign(dy) * maxStep
    const onGround = yPos.current <= groundY.current + 1e-3 && yVel.current <= 0

    if (pressed.current['Space'] && onGround && !crouching) {
      yVel.current = JUMP_VELOCITY
    }

    let dx = 0,
      dz = 0
    if (forward) {
      dx += dir.x
      dz += dir.z
    }
    if (back) {
      dx -= dir.x
      dz -= dir.z
    }
    if (rightKey) {
      dx += right.x
      dz += right.z
    }
    if (left) {
      dx -= right.x
      dz -= right.z
    }
    // Mobile joystick: y = forward/back along heading, x = strafe along right.
    const jv = walkInput.move
    dx += dir.x * jv.y + right.x * jv.x
    dz += dir.z * jv.y + right.z * jv.x

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz)
      // Analog: keyboard pushes len≈1 (full speed); joystick scales by how far
      // the thumb is pushed, capped at 1 so combined input never exceeds speed.
      const throttle = Math.min(1, len)
      const stepDt = Math.min(dt, 0.05)
      const speed = (crouching ? SNEAK_SPEED : WALK_SPEED) * throttle
      dx = (dx / len) * speed * stepDt
      dz = (dz / len) * speed * stepDt
      const from: [number, number] = [camera.position.x, camera.position.z]
      const to: [number, number] = [from[0] + dx, from[1] + dz]
      let next = resolveMovement(from, to, WALK_PLAYER_RADIUS, collisionWalls.current)
      // Block walking through furniture: push out of any footprint, then
      // re-resolve walls so a piece can't shove the walker through a wall.
      if (blockers.current.length > 0) {
        const pushed = resolveCircleVsObbs(next[0], next[1], WALK_PLAYER_RADIUS, blockers.current)
        next = resolveMovement(
          [next[0], next[1]],
          pushed,
          WALK_PLAYER_RADIUS,
          collisionWalls.current,
        )
      }
      camera.position.x = next[0]
      camera.position.z = next[1]
    }

    if (onGround && yVel.current === 0) {
      yPos.current = groundY.current
    } else {
      yVel.current -= GRAVITY * dt
      yPos.current += yVel.current * dt
      if (yPos.current <= groundY.current) {
        yPos.current = groundY.current
        yVel.current = 0
      }
    }
    // Subtle head-bob while walking on the ground; eased in/out so stopping
    // doesn't jolt. Steady amplitude to stay comfortable (no motion sickness).
    const wantBob = moving && onGround ? 1 : 0
    bobAmp.current += (wantBob - bobAmp.current) * Math.min(1, dt * 8)
    if (wantBob) bobPhase.current += dt * BOB_FREQUENCY * (crouching ? 0.7 : 1)
    const bob = Math.sin(bobPhase.current) * BOB_AMPLITUDE * bobAmp.current
    camera.position.y = yPos.current + bob

    aimAccum.current += dt
    if (aimAccum.current < AIM_CHECK_INTERVAL) return
    aimAccum.current = 0

    const ox = camera.position.x
    const oz = camera.position.z
    const blocked = (hitX: number, hitZ: number) =>
      isLineOfSightBlocked(ox, oz, hitX, hitZ, collisionWalls.current)
    const aimedDoorId = nearestAimedSegment(
      ox,
      oz,
      dir.x,
      dir.z,
      DOOR_SEGMENTS,
      INTERACT_RADIUS,
      blocked,
    )
    useStore.getState().setNearbyDoor(aimedDoorId)
    // Fixture aim shares the exact ray/segment math (`nearestAimedSegment`)
    // with the door aim above — a separate id space (`nearbyFixtureId`) so a
    // door and a curtain never compete for the same "nearby" slot.
    const aimedFixtureId = nearestAimedSegment(
      ox,
      oz,
      dir.x,
      dir.z,
      fixtureSegments.current,
      INTERACT_RADIUS,
      blocked,
    )
    useStore.getState().setNearbyFixture(aimedFixtureId)
    // Screens and lights compete for the SAME "nearby" slot on genuine
    // nearest-wins (WALK-SCREEN-INTERACT/WALK-LIGHT-INTERACT), unlike
    // doors-vs-fixtures above (a fixed priority order, door first). Segment
    // ids are namespaced with a `screen:`/`light:` prefix so one
    // `nearestAimedSegment` call can rank both categories together and the
    // winner's real item id + category are recovered from the prefix.
    const screenLightSegments = COMBINED_SCRATCH
    screenLightSegments.length = 0
    for (const seg of screenSegments.current)
      screenLightSegments.push(prefixSegment('screen:', seg))
    for (const seg of lightSegments.current) screenLightSegments.push(prefixSegment('light:', seg))
    const aimedScreenOrLightId = nearestAimedSegment(
      ox,
      oz,
      dir.x,
      dir.z,
      screenLightSegments,
      INTERACT_RADIUS,
      blocked,
    )
    if (aimedScreenOrLightId?.startsWith('screen:')) {
      useStore.getState().setNearbyScreen(aimedScreenOrLightId.slice('screen:'.length))
      useStore.getState().setNearbyLight(null)
    } else if (aimedScreenOrLightId?.startsWith('light:')) {
      useStore.getState().setNearbyLight(aimedScreenOrLightId.slice('light:'.length))
      useStore.getState().setNearbyScreen(null)
    } else {
      useStore.getState().setNearbyScreen(null)
      useStore.getState().setNearbyLight(null)
    }

    // Walk-measure live preview (WALK-MEASURE): while the first point is
    // placed and the second isn't, keep `walkMeasureLive` tracking the
    // current aim so the WalkHud/overlay can show a running distance — same
    // throttled cadence as the checks above, and only while it can actually
    // matter (never once a measurement is complete or before it starts).
    const measureState = useStore.getState()
    if (
      isFeatureEnabled('walkMeasure') &&
      measureState.walkMeasureA &&
      !measureState.walkMeasureB
    ) {
      camera.getWorldDirection(aimDir3D.current)
      measureRaycaster.current.set(camera.position, aimDir3D.current)
      // Same LineSegments2 requirement as the request branch above.
      measureRaycaster.current.camera = camera
      const hits = measureRaycaster.current.intersectObjects(scene.children, true)
      measureState.setWalkMeasureLive(nearestMeasurableHit(hits))
    } else if (measureState.walkMeasureLive !== null) {
      measureState.setWalkMeasureLive(null)
    }
  })

  return null
}
