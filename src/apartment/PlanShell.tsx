import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh, MeshStandardMaterial } from 'three'
import { type WallBox, wallBoxes } from '../floorplan/planGeometry'
import { planBounds, wallLength } from '../floorplan/types'
import type { MaterialId } from '../materials/types'
import { useStore } from '../state/store'
import { PlanRoomCeiling } from './floor/PlanRoomCeiling'
import { PlanRoomFloor } from './floor/PlanRoomFloor'

const DEFAULT_PLAN_FLOOR = 'floor-wood-oak'

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
function FadeWall({ box, cx, cz }: { box: WallBox; cx: number; cz: number }) {
  const ref = useRef<Mesh>(null)
  const { camera } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    let target = 1
    if (cameraMode === 'orbit') {
      // Wall is "between" camera and centre when (K-W)·(C-W) < 0.
      const kx = camera.position.x - box.cx
      const kz = camera.position.z - box.cz
      const dx = cx - box.cx
      const dz = cz - box.cz
      if (kx * dx + kz * dz < 0) target = 0.12
    }
    mat.opacity += (target - mat.opacity) * 0.18
    mat.transparent = mat.opacity < 0.98
    mat.depthWrite = mat.opacity > 0.6
  })
  return (
    <mesh
      ref={ref}
      position={[box.cx, box.cy, box.cz]}
      rotation={[0, box.angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[box.thickness, box.height, box.length]} />
      <meshStandardMaterial color="#ede9e2" roughness={0.9} transparent opacity={1} />
    </mesh>
  )
}

/**
 * Lightweight 3D shell for a user-authored floor plan: a grounding slab,
 * neutral per-room floors, and extruded walls with door/window openings (plus
 * glass panes in windows). Used in place of the curated <Apartment/> when a
 * non-default plan is active, so custom apartments are furnishable in 3D.
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan)
  const [ew, ed] = planBounds(plan)

  const boxes = useMemo(() => plan.walls.flatMap((w) => wallBoxes(plan, w)), [plan])

  // Window glass panes (between sill and head, in the wall gap).
  const windows = useMemo(() => {
    return plan.openings
      .filter((o) => o.kind === 'window')
      .map((o) => {
        const wall = plan.walls.find((w) => w.id === o.wallId)
        if (!wall) return null
        const len = wallLength(wall)
        if (len === 0) return null
        const dx = (wall.end[0] - wall.start[0]) / len
        const dz = (wall.end[1] - wall.start[1]) / len
        const angle = Math.atan2(dx, dz)
        const s = o.offset + o.width / 2
        return {
          id: o.id,
          cx: wall.start[0] + dx * s,
          cz: wall.start[1] + dz * s,
          cy: (o.sill + o.head) / 2,
          width: o.width,
          height: o.head - o.sill,
          angle,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
  }, [plan])

  return (
    <group>
      {/* Grounding slab — top kept 10 cm below the plan floors to avoid
          z-fighting (see Apartment.tsx). */}
      <mesh position={[ew / 2, -0.2, ed / 2]} receiveShadow>
        <boxGeometry args={[ew + 0.5, 0.2, ed + 0.5]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} />
      </mesh>

      {/* Per-room floors (catalog finish, defaulting to oak) */}
      {plan.rooms.map((r) => {
        const mat = (r.floor ?? DEFAULT_PLAN_FLOOR) as MaterialId
        // A non-rectangular room renders one triangulated polygon floor; a
        // rect room renders its rectangle (+ optional L-extension rect).
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomFloor
              key={r.id}
              roomId={r.id}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              polygon={r.polygon}
              materialId={mat}
            />
          )
        }
        return (
          <group key={r.id}>
            <PlanRoomFloor
              roomId={r.id}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              materialId={mat}
            />
            {r.extension && (
              <PlanRoomFloor
                roomId={r.id}
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                materialId={mat}
              />
            )}
          </group>
        )
      })}

      {/* Per-room ceilings (downward-facing — seen in walk, culled in orbit).
          Honour a per-room override, falling back to the plan height. */}
      {plan.rooms.map((r) => {
        const h = r.ceilingHeight ?? plan.ceilingHeight
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomCeiling
              key={r.id}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              height={h}
              polygon={r.polygon}
            />
          )
        }
        return (
          <group key={r.id}>
            <PlanRoomCeiling origin={r.origin} width={r.width} depth={r.depth} height={h} />
            {r.extension && (
              <PlanRoomCeiling
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                height={h}
              />
            )}
          </group>
        )
      })}

      {/* Walls (fade when between the orbit camera and the plan centre) */}
      {boxes.map((b, i) => (
        <FadeWall key={i} box={b} cx={ew / 2} cz={ed / 2} />
      ))}

      {/* Skirting along floor-reaching wall spans */}
      {boxes
        .filter((b) => b.cy - b.height / 2 < 0.01)
        .map((b, i) => (
          <mesh
            key={`sk${i}`}
            position={[b.cx, 0.045, b.cz]}
            rotation={[0, b.angle, 0]}
            receiveShadow
          >
            <boxGeometry args={[b.thickness + 0.024, 0.09, b.length]} />
            <meshStandardMaterial color="#eceae4" roughness={0.7} />
          </mesh>
        ))}
      {/* (Crown molding removed — a light fixed-colour band at the wall top
          read as a discoloured strip; the wall face runs cleanly to the
          ceiling instead.) */}

      {/* Window glass */}
      {windows.map((w) => (
        <mesh key={w.id} position={[w.cx, w.cy, w.cz]} rotation={[0, w.angle, 0]}>
          <boxGeometry args={[0.03, w.height, w.width]} />
          <meshStandardMaterial
            color="#bcd6e6"
            transparent
            opacity={0.32}
            roughness={0.1}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  )
}
