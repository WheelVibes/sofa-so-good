import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'
import type { RoomId } from '../../apartment/types'
import { type AimSegment, nearestAimedSegment } from '../../collision/aimRay'
import { doorAimSegments } from '../../collision/doorAim'
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
  itemsOnLevel,
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
import { beginCameraGesture, endCameraGesture } from '../cameraMotionSignal'
import {
  createGestureLease,
  expireGestureLease,
  LEASE_IDLE_MS,
  releaseGestureLease,
  renewGestureLease,
} from '../gestureLease'
import { getRoomEditorShell } from '../roomEditorShell'
import { resetWalkMove, walkInput } from '../walkInput'
import { clampWalkEyeHeight, WALK_PLAYER_RADIUS, walkVerticalFov } from './walkCameraSettings'
import { gestureEdge } from './walkGestureInput'
import { _resetWalkMeasureRequest, consumeWalkMeasureRequest } from './walkMeasureRequest'
import { resolveWalkSpawn } from './walkSpawn'
import { _resetWalkTeleport, consumeWalkTeleport } from './walkTeleport'

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
  const { camera, gl, scene, size } = useThree()
  const pressed = useRef<Record<string, boolean>>({})
  // WALK-GESTURE-DEGRADE: last frame's "a movement key is held" sample, so
  // `gestureEdge` can turn keydown/keyup (which fire once per press/release,
  // with no repeat guaranteed while held) into a single begin/end pulse on
  // the shared camera-gesture signal, sampled once per frame in useFrame.
  const keyGestureActive = useRef(false)
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
  // WALK-AIM-PLAN: every aim target below is scoped to the walker's storey, the
  // same way `blockers` is. An `AimSegment` is purely 2D (`sx/sz` + `segDx/segDz`
  // — see `collision/aimRay.ts`) and the ray test only uses x/z, so height cannot
  // separate two storeys: on a maisonette, whose upper level sits directly over
  // the lower one, an unscoped list let the walker aim THROUGH THE FLOOR and
  // toggle a lamp, a TV or a curtain on the storey below.
  const levelItems = useMemo(() => itemsOnLevel(items, walkerLevelId), [items, walkerLevelId])
  // Curtain/blind aim segments (WINDOW-FIXTURE-INTERACT) — rebuilt whenever
  // items change, like `blockers` above; empty (and never aimed at) while the
  // flag is off, so the interaction is gated at registration, not render.
  const fixtureSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    fixtureSegments.current = isFeatureEnabled('walkWindowFixtures')
      ? windowFixtureAimSegments(levelItems, getDef)
      : []
  }, [levelItems, getDef])
  // Screen (WALK-SCREEN-INTERACT) and light (WALK-LIGHT-INTERACT) aim
  // segments — same rebuild-on-items pattern as the fixture segments above,
  // gated at registration (empty, never aimed at, while its flag is off).
  const screenSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    screenSegments.current = isFeatureEnabled('walkScreens')
      ? screenAimSegments(levelItems, getDef)
      : []
  }, [levelItems, getDef])
  const lightSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    lightSegments.current = isFeatureEnabled('walkLights')
      ? lightAimSegments(levelItems, getDef)
      : []
  }, [levelItems, getDef])
  // Door aim segments come from the LOADED plan's openings on the walked storey.
  // They used to be a module-level constant built from `apartment/constants.ts`
  // — the DEFAULT FLAT's hardcoded doors — so on every other template the walker
  // aimed at phantom doorways from a different apartment and could not open any
  // real one: the maisonette's eight door ids (`em-main`, `em-wc`,
  // `emu-bed2-door`, ...) overlap the constants' eight (`door-main`,
  // `door-mainBedroom`, ...) by ZERO. `openingSegments` is the same geometry the
  // minimap draws doorways with, so what you see as a gap is what you can open.
  const doorSegments = useRef<AimSegment[]>([])
  useEffect(() => {
    doorSegments.current = doorAimSegments(
      levelAsPlan(floorPlan, walkLevel(floorPlan, viewLevelId)),
    )
  }, [floorPlan, viewLevelId])

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
      // WALK-GESTURE-DEGRADE: leaving walk mode with a movement key still
      // held (e.g. exiting mid-stride) must release the signal — useFrame
      // stops running once this component unmounts, so no later 'end' edge
      // would ever fire otherwise.
      if (keyGestureActive.current) {
        keyGestureActive.current = false
        endCameraGesture()
      }
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
    // WALK-GESTURE-LEASE (N2): the look surface owns its touches. Without
    // `touch-action: none` the compositor starts a scroll/pan on the canvas as
    // soon as a finger moves, and from that moment every `touchmove` arrives
    // with `cancelable === false` — Chrome then logs the intervention "Ignored
    // attempt to cancel a touchmove event with cancelable=false, for example
    // because scrolling is in progress and cannot be interrupted" and drops the
    // `preventDefault()` on the floor (130 of them in the 2026-09-18 sweep).
    // The canonical fix is exactly this pair: declare the element's gestures
    // ours in CSS *and* register non-passive listeners so the browser knows a
    // cancel may come (Chrome 56's "Making touch scrolling fast by default"
    // intervention — https://developer.chrome.com/blog/scrolling-intervention).
    // Set on the element here (not in `src/styles/**`) because the canvas is
    // r3f's and this is the component that claims its input.
    const prevTouchAction = dom.style.touchAction
    dom.style.touchAction = 'none'

    if (IS_COARSE_POINTER) {
      let lookId: number | null = null
      let lastX = 0
      let lastY = 0
      let gestureBegun = false
      const endTouchGesture = () => {
        if (gestureBegun) {
          gestureBegun = false
          endCameraGesture()
        }
      }
      const onTouchStart = (e: TouchEvent) => {
        if (lookId !== null) return
        // A touch that lands on the canvas (not a UI control) becomes the look
        // drag. The joystick stops propagation, so its touches never arrive here.
        const t = e.changedTouches[0]
        if (!t) return
        // Claim the sequence in `touchstart`, the only point at which the
        // browser is still deciding whether this is a scroll. With
        // `touch-action: none` above this is belt-and-braces, but it is what
        // makes the claim independent of any CSS a parent might reset.
        if (e.cancelable) e.preventDefault()
        lookId = t.identifier
        lastX = t.clientX
        lastY = t.clientY
        // v0.35.5.2's `BEGIN_DEFER_MS = 120` deferred this call to dodge the
        // freeze the cancelled-touchmove intervention caused. With the surface
        // owning its touches the freeze has no cause, so the defer is gone and
        // yaw tracks the drag from the first frame again (WALK-GESTURE-LEASE).
        gestureBegun = true
        beginCameraGesture()
      }
      const onTouchMove = (e: TouchEvent) => {
        if (lookId === null) return
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== lookId) continue
          yaw.current -= (t.clientX - lastX) * TOUCH_LOOK_SENSITIVITY
          pitch.current = clampPitch(pitch.current - (t.clientY - lastY) * TOUCH_LOOK_SENSITIVITY)
          lastX = t.clientX
          lastY = t.clientY
          // `cancelable` is false only if a scroll already started despite the
          // above; cancelling then is exactly what the intervention logs, so
          // don't — the drag still tracks, the console stays clean.
          if (e.cancelable) e.preventDefault()
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === lookId) {
            lookId = null
            endTouchGesture()
          }
        }
      }
      dom.addEventListener('touchstart', onTouchStart, { passive: false })
      dom.addEventListener('touchmove', onTouchMove, { passive: false })
      dom.addEventListener('touchend', onTouchEnd)
      dom.addEventListener('touchcancel', onTouchEnd)
      window.addEventListener('blur', endTouchGesture)
      return () => {
        dom.style.touchAction = prevTouchAction
        dom.removeEventListener('touchstart', onTouchStart)
        dom.removeEventListener('touchmove', onTouchMove)
        dom.removeEventListener('touchend', onTouchEnd)
        dom.removeEventListener('touchcancel', onTouchEnd)
        window.removeEventListener('blur', endTouchGesture)
        // A teardown mid-drag (leaving walk mode, unmount) must still release
        // the signal — the listeners above are gone so no more onTouchEnd will.
        lookId = null
        endTouchGesture()
      }
    }

    const isLocked = () => document.pointerLockElement === dom
    // WALK-GESTURE-LEASE (N1): **Pointer Lock is a STATE, not a gesture.**
    // v0.35.5.2 began the shared camera gesture on lock ACQUIRE and ended it on
    // the releasing `pointerlockchange` — which in the 2026-09-18 sweep never
    // arrived (headless grants the lock and never drops it, and this component
    // stays mounted across clips), so the ref-count stuck `active` and the
    // GPU-STARVE-1 degrade pinned the canvas at DPR 0.5 for 7 clips / ~2 100
    // frames. A user holding the lock while standing still is not driving the
    // camera either, so the old model was wrong even where the event fires.
    //
    // The gesture is now a LEASE taken by actual MOUSE MOVEMENT while locked,
    // renewed by each further movement, and expiring by itself
    // `LEASE_IDLE_MS` after the last one (`../gestureLease`, unit-tested).
    // Every begin therefore owns a guaranteed end — the idle timer, plus the
    // belt-and-braces releases below (mouseup/pointerup/blur/tab-hidden/
    // pointerlockerror/lock dropped/unmount) — and `cameraMotionSignal`'s
    // watchdog force-releases anything that still slips through.
    const lease = createGestureLease()
    let idleTimer = 0
    const clearIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer)
        idleTimer = 0
      }
    }
    const releaseLook = () => {
      clearIdleTimer()
      if (releaseGestureLease(lease) === 'end') endCameraGesture()
    }
    const armIdleTimer = () => {
      clearIdleTimer()
      idleTimer = window.setTimeout(() => {
        idleTimer = 0
        if (expireGestureLease(lease, performance.now()) === 'end') endCameraGesture()
      }, LEASE_IDLE_MS)
    }
    const onClick = () => {
      if (!isLocked()) void dom.requestPointerLock()
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked()) return
      yaw.current -= e.movementX * LOOK_SENSITIVITY
      pitch.current = clampPitch(pitch.current - e.movementY * LOOK_SENSITIVITY)
      // The mouse only fires `mousemove` when it actually moves, so every one
      // of these IS the drag — take the lease on the first, renew on the rest.
      if (renewGestureLease(lease, performance.now()) === 'begin') beginCameraGesture()
      armIdleTimer()
    }
    const onLockChange = () => {
      // Dropping the lock (Esc) shouldn't leave movement keys "stuck" down.
      if (!isLocked()) pressed.current = {}
      dom.style.cursor = isLocked() ? 'none' : 'grab'
      // Losing the lock ends the look outright; acquiring it does NOT begin one.
      if (!isLocked()) releaseLook()
    }
    const onVisibility = () => {
      if (document.hidden) releaseLook()
    }
    dom.style.cursor = 'grab'
    dom.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', releaseLook)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('mouseup', releaseLook)
    window.addEventListener('pointerup', releaseLook)
    window.addEventListener('blur', releaseLook)
    return () => {
      dom.style.cursor = ''
      dom.style.touchAction = prevTouchAction
      dom.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', releaseLook)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('mouseup', releaseLook)
      window.removeEventListener('pointerup', releaseLook)
      window.removeEventListener('blur', releaseLook)
      if (document.pointerLockElement === dom) document.exitPointerLock()
      // The listeners above are already gone, so nothing else will release the
      // lease — do it here rather than leave the signal stuck active.
      releaseLook()
    }
  }, [gl])

  // Dev-only: scenario-harness lever to set/read the walk-mode look direction
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
      // Yaw joined pitch in v0.31.8.48, for the same reason and with the same
      // scope: verifying (g) LEVEL-ISOLATION-IN-WALK needs the walker turned
      // toward `tpl-loft`'s mezzanine rail, and the spawn faces a wall. Without
      // it a walk-mode change can be unit-tested but never SEEN — that release
      // shipped with its visual proof owed for exactly this reason.
      setYaw: (y: number) => {
        yaw.current = y
      },
      getYaw: () => yaw.current,
      // Position joined yaw in v0.31.8.49. Aiming alone was not enough to verify
      // (g): WASD is gated on Pointer Lock too, so the walker was stuck at its
      // spawn, and `tpl-loft`'s guard rail is across the room from there. The
      // frame loop resolves movement FROM the current position each tick, so
      // writing x/z with no key held simply relocates the walker; collision and
      // the floor-height solve then apply from the new spot exactly as if it had
      // been walked to.
      setPosition: (x: number, z: number) => {
        camera.position.x = x
        camera.position.z = z
      },
      getPosition: () => [camera.position.x, camera.position.z] as [number, number],
    }
    ;(window as unknown as { __walkLook?: typeof lever }).__walkLook = lever
    return () => {
      delete (window as unknown as { __walkLook?: typeof lever }).__walkLook
    }
  }, [camera])

  useEffect(() => {
    // Each branch picks a nominal standing point + a point to face; the spawn is
    // then nudged clear of whatever furniture happens to stand there
    // (WALK-SPAWN-CLEAR) before it is applied, so entering walk mode never puts
    // the eye inside a table/bed/sofa.
    let sx: number
    let sz: number
    let lx: number
    let lz: number
    let eye = eyeHeightRef.current
    if (roomEditorId) {
      // Spawn in the centre of the isolated room, looking toward its far edge
      // (default apartment or custom plan). Plan read fresh (not a dep) so a
      // plan edit during walk never re-spawns the player.
      const editorShell = getRoomEditorShell(useStore.getState().floorPlan, roomEditorId)
      const [cx, cz] = editorShell ? editorShell.shell.center : [0, 0]
      sx = cx
      sz = cz
      lx = cx
      lz = cz - 1
    } else if (isDefaultPlan(useStore.getState().floorPlan)) {
      // Arrive the way you actually enter the flat: standing in the entrance
      // foyer (main door on the SE step wall), looking north up the long axis of
      // the living/dining. The old spawn (11, 6) stood in the middle of the
      // dining table with the pendant at head height — the tabletop filled the
      // first frame and the first step jerked sideways as the furniture solver
      // pushed the walker out, which read as a cramped flat. This point is ~6 m
      // of clear sightline, the most open view the plan has.
      sx = 11
      sz = 7.5
      lx = 10.7
      lz = 3.2
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
        eye = level.elevation + eyeHeightRef.current
        sx = cx
        sz = cz + span * 0.32
        lx = cx
        lz = cz - span * 0.32
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
        sx = cx
        sz = cz + span * 0.32
        lx = cx
        lz = cz - span * 0.32
      }
    }
    // Nudge off any furniture footprint / through-wall push, exactly like a
    // normal step (and the minimap teleport) already does.
    const [px, pz] = resolveWalkSpawn(sx, sz, blockers.current, collisionWalls.current)
    camera.position.set(px, eye, pz)
    camera.lookAt(lx, eye, lz)
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
  // visibly widens/narrows the view without re-spawning the walker (PARITY-WALKCAM),
  // and to the viewport size: three's `fov` is the VERTICAL angle, so a tall/narrow
  // viewport (phone portrait, a narrow window) would silently squeeze the sideways
  // view down to tunnel vision — `walkVerticalFov` holds a horizontal floor instead
  // (WALK-HFOV-FLOOR). Desktop-wide canvases are already past the floor, so they see
  // exactly the slider value.
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const prevFov = camera.fov
    camera.fov = walkVerticalFov(walkFov, size.height > 0 ? size.width / size.height : 0)
    camera.updateProjectionMatrix()
    return () => {
      camera.fov = prevFov
      camera.updateProjectionMatrix()
    }
  }, [camera, walkFov, size.width, size.height])

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
    // WALK-GESTURE-DEGRADE (S7): a held movement key drives the camera every
    // frame just like an OrbitControls drag, but keydown/keyup are discrete
    // (one event per press/release) — `gestureEdge` turns this per-frame
    // sample into a single begin/end pulse on the shared signal instead of
    // one call every frame it stays held. Joystick engage/release calls the
    // same signal directly from `WalkJoystick`'s pointerdown/up (its own
    // discrete pair); look-drag begin/end is wired above. All three share
    // `cameraMotionSignal`'s ref-count, so overlapping inputs (e.g. a key
    // held while also dragging to look) end the degrade exactly once, on the
    // last one released.
    const movementKeyHeld = !!(forward || back || left || rightKey || crouching)
    const keyEdge = gestureEdge(movementKeyHeld, keyGestureActive.current)
    if (keyEdge === 'begin') beginCameraGesture()
    else if (keyEdge === 'end') endCameraGesture()
    keyGestureActive.current = movementKeyHeld
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
      doorSegments.current,
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
