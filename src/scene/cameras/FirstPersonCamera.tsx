import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { DOORS, WALLS } from '../../apartment/constants'
import { roomShell } from '../../apartment/roomShell'
import { buildRoomCollisionWalls } from '../../collision/roomCollisionWalls'
import { type CollisionWall, isLineOfSightBlocked, resolveMovement } from '../../collision/walls'
import { buildCollisionWalls } from '../../collision/wallsFromState'
import { KEYBINDINGS } from '../../controls/keybindings'
import { isEditableTarget } from '../../controls/useKeyboard'
import { isDefaultPlan, planCollisionWalls } from '../../floorplan/planGeometry'
import { useStore } from '../../state/store'

interface DoorSegment {
  id: string
  sx: number
  sz: number
  segDx: number
  segDz: number
}

const DOOR_SEGMENTS: DoorSegment[] = (() => {
  const out: DoorSegment[] = []
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

const EYE_HEIGHT = 1.65
const CROUCH_HEIGHT = 1.05
const CROUCH_RATE = 4.5
const WALK_FOV = 60
const WALK_SPEED = 2.1 // ≈ a relaxed real walking pace (m/s)
const SNEAK_SPEED = 1.0
const BOB_AMPLITUDE = 0.022 // subtle vertical head-bob while walking
const BOB_FREQUENCY = 9.0 // rad/s ≈ ~1.4 steps/s cadence
const JUMP_VELOCITY = 4.2
const GRAVITY = 14
const POINTER_SPEED = 1.4
const PLAYER_RADIUS = 0.25
const INTERACT_RADIUS = 2.0
const AIM_CHECK_INTERVAL = 0.1

export function FirstPersonCamera() {
  const { camera } = useThree()
  const pressed = useRef<Record<string, boolean>>({})
  const doors = useStore((s) => s.doors)
  const floorPlan = useStore((s) => s.floorPlan)
  const roomEditorId = useStore((s) => s.roomEditor.roomId)
  const collisionWalls = useRef<CollisionWall[]>([])

  useEffect(() => {
    // In the per-room editor, bound the player to the isolated room's clipped
    // walls. Otherwise walk-mode collision follows the active plan (custom
    // apartments included).
    collisionWalls.current = roomEditorId
      ? buildRoomCollisionWalls(roomEditorId, doors)
      : isDefaultPlan(floorPlan)
        ? buildCollisionWalls(doors)
        : planCollisionWalls(floorPlan, doors)
  }, [doors, floorPlan, roomEditorId])

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
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
    document.addEventListener('pointerlockchange', clearAll)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', clearAll)
      document.removeEventListener('pointerlockchange', clearAll)
    }
  }, [])

  useEffect(() => {
    if (roomEditorId) {
      // Spawn in the centre of the isolated room, looking toward its far edge.
      const shell = roomShell(roomEditorId)
      const [cx, cz] = shell.center
      camera.position.set(cx, EYE_HEIGHT, cz)
      camera.lookAt(cx, EYE_HEIGHT, cz - 1)
    } else {
      camera.position.set(11, EYE_HEIGHT, 6)
      // Face into the living/dining instead of inheriting the orbit angle.
      camera.lookAt(10.4, EYE_HEIGHT, 2.5)
    }
    yPos.current = EYE_HEIGHT
    yVel.current = 0
    groundY.current = EYE_HEIGHT
    let prevFov: number | null = null
    if (camera instanceof PerspectiveCamera) {
      prevFov = camera.fov
      camera.fov = WALK_FOV
      camera.updateProjectionMatrix()
    }
    return () => {
      useStore.getState().setNearbyDoor(null)
      if (camera instanceof PerspectiveCamera && prevFov !== null) {
        camera.fov = prevFov
        camera.updateProjectionMatrix()
      }
    }
  }, [camera, roomEditorId])

  const tmpForward = useRef(new Vector3())
  const tmpRight = useRef(new Vector3())
  const aimAccum = useRef(0)
  const yPos = useRef(EYE_HEIGHT)
  const yVel = useRef(0)
  const groundY = useRef(EYE_HEIGHT)
  const bobPhase = useRef(0)
  const bobAmp = useRef(0)

  useFrame((_, dt) => {
    const dir = tmpForward.current
    camera.getWorldDirection(dir)
    dir.y = 0
    dir.normalize()
    const right = tmpRight.current.set(-dir.z, 0, dir.x)

    const forward = pressed.current[KEYBINDINGS.walkForward] || pressed.current['ArrowUp']
    const back = pressed.current[KEYBINDINGS.walkBack] || pressed.current['ArrowDown']
    const left = pressed.current[KEYBINDINGS.walkLeft] || pressed.current['ArrowLeft']
    const rightKey = pressed.current[KEYBINDINGS.walkRight] || pressed.current['ArrowRight']
    const moving = !!(forward || back || left || rightKey)
    const crouching = !!pressed.current['ShiftLeft'] || !!pressed.current['ShiftRight']
    const targetGround = crouching ? CROUCH_HEIGHT : EYE_HEIGHT
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

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz)
      const stepDt = Math.min(dt, 0.05)
      const speed = crouching ? SNEAK_SPEED : WALK_SPEED
      dx = (dx / len) * speed * stepDt
      dz = (dz / len) * speed * stepDt
      const from: [number, number] = [camera.position.x, camera.position.z]
      const to: [number, number] = [from[0] + dx, from[1] + dz]
      const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current)
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

    const setNearbyDoor = useStore.getState().setNearbyDoor
    let aimedId: string | null = null
    let bestHitDist = INTERACT_RADIUS
    const ox = camera.position.x
    const oz = camera.position.z
    for (const seg of DOOR_SEGMENTS) {
      const denom = dir.x * seg.segDz - dir.z * seg.segDx
      if (Math.abs(denom) < 1e-6) continue
      const relX = seg.sx - ox
      const relZ = seg.sz - oz
      const t = (relX * seg.segDz - relZ * seg.segDx) / denom
      const u = (relX * dir.z - relZ * dir.x) / denom
      if (t <= 0 || t > bestHitDist) continue
      if (u < 0 || u > 1) continue
      const hitX = ox + dir.x * t
      const hitZ = oz + dir.z * t
      if (isLineOfSightBlocked(ox, oz, hitX, hitZ, collisionWalls.current)) continue
      bestHitDist = t
      aimedId = seg.id
    }
    setNearbyDoor(aimedId)
  })

  return <PointerLockControls pointerSpeed={POINTER_SPEED} />
}
