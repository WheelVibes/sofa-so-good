import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { useStore } from '../state/store'
import { DOORS, FLAT, WALLS } from './constants'
import type { DoorSpec, WallSpec } from './types'
import { getWallOpacity } from './walls/wallReveal'

const SWING_RAD = Math.PI / 2
const SWING_SECONDS = 0.2

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId)
}

export function DoorLeaf({ spec }: { spec: DoorSpec }) {
  const wall = findWall(spec.wallId)
  const isOpen = useStore((s) => s.doors[spec.id]?.open ?? spec.defaultOpen)
  const toggle = useStore((s) => s.toggleDoor)
  const swingRef = useRef<Group>(null!)
  const rootRef = useRef<Group>(null)
  const angleRef = useRef(0)

  useFrame((_, dt) => {
    if (rootRef.current) rootRef.current.visible = getWallOpacity(spec.wallId) > 0.35
    const target = isOpen ? SWING_RAD : 0
    if (angleRef.current === target) return
    const step = (SWING_RAD / SWING_SECONDS) * dt
    if (Math.abs(target - angleRef.current) < step) {
      angleRef.current = target
    } else {
      angleRef.current += Math.sign(target - angleRef.current) * step
    }
    if (swingRef.current) {
      const swingSign = spec.swing === 'left' ? 1 : -1
      swingRef.current.rotation.y = swingSign * angleRef.current
    }
  })

  if (!wall) return null
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  const hingeLocalX =
    spec.hinge === 'start' ? spec.offset - length / 2 : spec.offset + spec.width - length / 2
  const direction = spec.hinge === 'start' ? 1 : -1
  // The household shelter's blast door is a thick reinforced steel slab,
  // not a panelled timber leaf — a recognisable HDB detail.
  const blast = spec.id === 'door-householdShelter'
  const leafThick = blast ? 0.14 : FLAT.doorThickness

  return (
    <group ref={rootRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group ref={swingRef} position={[hingeLocalX, 0, 0]}>
        <group position={[(direction * spec.width) / 2, FLAT.doorHeight / 2, 0]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              toggle(spec.id)
            }}
            castShadow
          >
            <boxGeometry args={[spec.width, FLAT.doorHeight, leafThick]} />
            {blast ? (
              <meshStandardMaterial color="#9aa0a6" roughness={0.45} metalness={0.65} />
            ) : (
              <meshStandardMaterial color="#9d7c54" roughness={0.7} />
            )}
          </mesh>
          {blast
            ? /* Bolt grid on the front face of the blast door. */
              [-1, 1].map((face) =>
                [-0.7, -0.35, 0, 0.35, 0.7].map((fy) =>
                  [-0.35, 0.35].map((fx) => (
                    <mesh
                      key={`${face}.${fy}.${fx}`}
                      position={[
                        fx * spec.width * 0.5,
                        fy * (FLAT.doorHeight / 2 - 0.1),
                        face * (leafThick / 2 + 0.01),
                      ]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
                      <meshStandardMaterial color="#6d7177" roughness={0.5} metalness={0.7} />
                    </mesh>
                  )),
                ),
              )
            : /* Recessed panels (two per face) for a panelled-door look. */
              [1, -1].map((face) =>
                [
                  { y: FLAT.doorHeight * 0.24, h: FLAT.doorHeight * 0.34 },
                  { y: -FLAT.doorHeight * 0.22, h: FLAT.doorHeight * 0.42 },
                ].map((p, i) => (
                  <mesh
                    key={`${face}.${i}`}
                    position={[0, p.y, face * (leafThick / 2 + 0.001)]}
                    rotation={[0, face === 1 ? 0 : Math.PI, 0]}
                  >
                    <planeGeometry args={[spec.width * 0.62, p.h]} />
                    <meshStandardMaterial color="#8a6c48" roughness={0.75} />
                  </mesh>
                )),
              )}
        </group>
        <group position={[direction * (spec.width - 0.06), 0.95, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 12]} />
            <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, 0.06]} castShadow>
            <sphereGeometry args={[0.025, 16, 12]} />
            <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, -0.06]} castShadow>
            <sphereGeometry args={[0.025, 16, 12]} />
            <meshStandardMaterial color="#c9a86a" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function Doors() {
  return (
    <group>
      {DOORS.map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  )
}
