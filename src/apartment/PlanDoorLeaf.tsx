import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { PlanOpening, PlanWall } from '../floorplan/types'
import { wallLength } from '../floorplan/types'
import { useStore } from '../state/store'
import { FLAT } from './constants'

const SWING_RAD = Math.PI / 2
const SWING_SECONDS = 0.2
const LEAF_THICK = FLAT.doorThickness

/**
 * A swinging, clickable door leaf for a **custom-plan** door opening — the 3D
 * equivalent of the default flat's {@link DoorLeaf}, driven by `PlanOpening`
 * data instead of the fixed `DoorSpec` tables. Without this a plan door reads as
 * an empty gap even when closed (and closed doors *do* block walk collision —
 * `planCollisionWalls` only opens a gap for an OPEN door), so the leaf removes
 * that visual/behaviour mismatch. Hinge/swing honour the opening; click toggles
 * it through the shared `doors` store (so collision + render stay in sync). It
 * fades out with the wall it sits in when that wall is between the orbit camera
 * and the plan centre, matching `FadeWall`.
 */
export function PlanDoorLeaf({
  wall,
  opening,
  cx,
  cz,
}: {
  wall: PlanWall
  opening: PlanOpening
  /** Plan-centre X/Z, for the camera-facing fade test. */
  cx: number
  cz: number
}) {
  const isOpen = useStore((s) => s.doors[opening.id]?.open ?? false)
  const toggle = useStore((s) => s.toggleDoor)
  const rootRef = useRef<Group>(null)
  const swingRef = useRef<Group>(null!)
  const angleRef = useRef(0)
  const { camera } = useThree()

  const len = wallLength(wall)
  const dx = len === 0 ? 1 : (wall.end[0] - wall.start[0]) / len
  const dz = len === 0 ? 0 : (wall.end[1] - wall.start[1]) / len
  const angle = Math.atan2(dz, dx)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  // Door world centre (for the fade test).
  const sCentre = opening.offset + opening.width / 2
  const doorX = wall.start[0] + dx * sCentre
  const doorZ = wall.start[1] + dz * sCentre

  const hinge = opening.hinge ?? 'start'
  const swing = opening.swing ?? 'right'
  const height = Math.max(0.4, opening.head - opening.sill)
  const hingeLocalX =
    hinge === 'start' ? opening.offset - len / 2 : opening.offset + opening.width - len / 2
  const direction = hinge === 'start' ? 1 : -1

  useFrame((_, dt) => {
    // Fade with the wall: hide when the wall sits between the orbit camera and
    // the plan centre (same predicate as FadeWall).
    if (rootRef.current) {
      const kx = camera.position.x - doorX
      const kz = camera.position.z - doorZ
      const between = kx * (cx - doorX) + kz * (cz - doorZ) < 0
      rootRef.current.visible = !(useStore.getState().cameraMode === 'orbit' && between)
    }
    const target = isOpen ? SWING_RAD : 0
    if (angleRef.current !== target) {
      const step = (SWING_RAD / SWING_SECONDS) * dt
      angleRef.current =
        Math.abs(target - angleRef.current) < step
          ? target
          : angleRef.current + Math.sign(target - angleRef.current) * step
    }
    if (swingRef.current)
      swingRef.current.rotation.y = (swing === 'left' ? 1 : -1) * angleRef.current
  })

  if (len === 0) return null

  return (
    <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group ref={swingRef} position={[hingeLocalX, opening.sill, 0]}>
        <group position={[(direction * opening.width) / 2, height / 2, 0]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              toggle(opening.id)
            }}
            castShadow
          >
            <boxGeometry args={[opening.width, height, LEAF_THICK]} />
            <meshStandardMaterial color="#9d7c54" roughness={0.7} />
          </mesh>
          {/* Recessed panels (two per face) for a panelled-door look. */}
          {[1, -1].map((face) =>
            [
              { y: height * 0.24, h: height * 0.34 },
              { y: -height * 0.22, h: height * 0.42 },
            ].map((p, i) => (
              <mesh
                key={`${face}.${i}`}
                position={[0, p.y, face * (LEAF_THICK / 2 + 0.001)]}
                rotation={[0, face === 1 ? 0 : Math.PI, 0]}
              >
                <planeGeometry args={[opening.width * 0.62, p.h]} />
                <meshStandardMaterial color="#8a6c48" roughness={0.75} />
              </mesh>
            )),
          )}
        </group>
        {/* Handle. */}
        <group position={[direction * (opening.width - 0.06), Math.min(0.95, height - 0.1), 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
            <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
          {[0.06, -0.06].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <sphereGeometry args={[0.025, 16, 12]} />
              <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}
