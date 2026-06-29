import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { type Group, Mesh, type MeshStandardMaterial, Vector2 } from 'three'
import type {
  PlanClippedWall,
  PlanRoomOpening,
  PlanRoomShell as Shell,
} from '../floorplan/planRoomShell'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../floorplan/roomFinishes'
import type { MaterialId } from '../materials/types'
import { finishSurfaceUserData } from '../scene/finishDropTarget'
import { useStore } from '../state/store'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { PlanWallFinishFace } from './walls/PlanWallFinishFace'
import { useWallReveal } from './walls/useWallReveal'
import { getWallOpacity } from './walls/wallReveal'

const WALL_COLOR = '#ede9e2' // matches PlanShell's plaster walls
const DOOR_COLOR = '#8a6d4f'
const GLASS_COLOR = '#bcd6e6'

function clippedThickness(t: PlanClippedWall['thickness']): number {
  return t === 'external' ? 0.2 : 0.1
}

/** A clipped plan wall box that hides itself when the orbit camera is on its
 *  outward side — the IKEA-planner camera-facing reveal, mirroring
 *  `apartment/RoomShell`'s WallBox but for plan walls (plain plaster material,
 *  thickness from the plan wall kind). */
function WallBox({
  wall,
  center,
  height,
  finishId,
  roomId,
}: {
  wall: PlanClippedWall
  center: [number, number]
  height: number
  /** Room wall finish; renders a room-facing finish plane over the plaster. */
  finishId: MaterialId | null
  /** The isolated room this clipped wall belongs to (finish-drop target tag). */
  roomId: string
}) {
  const ref = useRef<Group>(null)
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const len = Math.hypot(ex - sx, ez - sz)
  const midX = (sx + ex) / 2
  const midZ = (sz + ez) / 2

  // Outward (away-from-room-centre) normal — a general perpendicular so
  // diagonal clipped walls resolve the same way as axis-aligned ones.
  const toMid = new Vector2(midX - center[0], midZ - center[1])
  const normal = new Vector2(-(ez - sz), ex - sx).normalize()
  if (toMid.dot(normal) < 0) normal.negate()

  // Fade the whole wall group (plaster body + finish face) to translucent when
  // the orbit camera fronts it — matches the main orbit scene's wall reveal.
  useWallReveal(ref, { midX, midZ, nx: normal.x, nz: normal.y, center, wallId: wall.wallId })

  if (len < 1e-6) return null
  const t = clippedThickness(wall.thickness)
  const h = wall.topHeight ?? height
  const angle = Math.atan2(ez - sz, ex - sx)
  // The group is rotated [0, -angle, 0], which maps local +Z to world
  // (-sin angle, cos angle); the finish face goes on whichever local-Z side
  // points back toward the room centre (opposite the outward normal).
  const localZ = new Vector2(-Math.sin(angle), Math.cos(angle))
  const interiorSign: 1 | -1 = localZ.dot(normal) >= 0 ? -1 : 1
  return (
    <group
      ref={ref}
      position={[midX, h / 2, midZ]}
      rotation={[0, -angle, 0]}
      // In the isolated room editor every clipped wall belongs to this room, so
      // tag the whole group as a wall drop target (scene/finishDropTarget.ts).
      userData={finishSurfaceUserData('wall', roomId)}
    >
      <mesh castShadow={false}>
        <boxGeometry args={[len, h, t]} />
        <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
      </mesh>
      {finishId ? (
        <PlanWallFinishFace
          materialId={finishId}
          width={len}
          height={h}
          position={[0, 0, interiorSign * (t / 2 + 0.001)]}
          yRot={interiorSign === 1 ? 0 : Math.PI}
        />
      ) : null}
    </group>
  )
}

/** A door leaf / window pane for a plan opening that fades together with its host
 *  wall during the orbit-style reveal (mirrors `Window`/`Door` in the default
 *  flat). Without this the opaque leaf / semi-transparent glass kept its fixed
 *  opacity while the wall faded, so it floated as a too-bright ghost. */
function PlanOpeningMesh({ entry }: { entry: PlanRoomOpening }) {
  const { opening: o, center, angle } = entry
  const ref = useRef<Group>(null)
  const transparentRef = useRef(false)
  const isDoor = o.kind === 'door'
  const h = Math.max(0.1, o.head - o.sill)
  const cy = isDoor ? h / 2 : (o.sill + o.head) / 2
  // The glass pane is intentionally see-through; the door leaf is solid. Both then
  // multiply by the host wall's reveal opacity each frame.
  const baseOpacity = isDoor ? 1 : 0.32

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const wallOp = getWallOpacity(o.wallId)
    g.visible = wallOp > 0.02
    if (!g.visible) return
    const fading = wallOp < 0.985
    const changed = fading !== transparentRef.current
    transparentRef.current = fading
    g.traverse((m) => {
      if (!(m instanceof Mesh)) return
      const mat = m.material as MeshStandardMaterial
      mat.transparent = !isDoor || fading
      mat.opacity = baseOpacity * wallOp
      mat.depthWrite = isDoor && wallOp > 0.6
      if (changed) mat.needsUpdate = true
    })
  })

  return (
    <group ref={ref} position={[center[0], cy, center[1]]} rotation={[0, angle, 0]}>
      <mesh>
        <boxGeometry args={[0.04, h, o.width]} />
        <meshStandardMaterial
          color={isDoor ? DOOR_COLOR : GLASS_COLOR}
          transparent={!isDoor}
          opacity={baseOpacity}
          roughness={isDoor ? 0.6 : 0.1}
          metalness={0}
        />
      </mesh>
    </group>
  )
}

/**
 * Renders one isolated room of a **custom floor plan** for the per-room editor —
 * the plan-data analogue of `apartment/RoomShell`. Per-rect (or polygon) floors
 * with the room's own floor finish, walls clipped to the room footprint (with
 * camera-facing reveal), plus door/window panels for the room's openings (placed
 * from the `PlanRoomShell`'s resolved opening centres + angles).
 */
export function PlanRoomShell({ shell }: { shell: Shell }) {
  const planHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const finishes = useStore((s) => s.finishes)
  const room = shell.room
  const height = room.ceilingHeight ?? planHeight
  const floorMat = resolvePlanRoomFloor(finishes, room) as MaterialId
  const wallMat = resolvePlanRoomWall(finishes, room) as MaterialId | null

  return (
    <group>
      {/* Floors: a polygon room renders one triangulated floor; otherwise the
          footprint rects (main + optional L-extension). */}
      {room.polygon && room.polygon.length >= 3 ? (
        <PlanRoomFloor
          roomId={room.id}
          origin={room.origin}
          width={room.width}
          depth={room.depth}
          polygon={room.polygon}
          materialId={floorMat}
        />
      ) : (
        shell.rects.map((r, i) => (
          <PlanRoomFloor
            key={`floor-${i}`}
            roomId={room.id}
            origin={[r.x0, r.z0]}
            width={r.x1 - r.x0}
            depth={r.z1 - r.z0}
            materialId={floorMat}
          />
        ))
      )}

      {shell.walls.map((w, i) => (
        <WallBox
          key={`${w.wallId}-${i}`}
          wall={w}
          center={shell.center}
          height={height}
          finishId={wallMat}
          roomId={room.id}
        />
      ))}

      {/* Openings: a glass pane (window) or a wood leaf (door), at the resolved
          centre, oriented along its host wall. Doors sit on the floor. Each fades
          with its host wall during the camera-facing reveal. */}
      {shell.openings.map((entry) => (
        <PlanOpeningMesh key={entry.opening.id} entry={entry} />
      ))}
    </group>
  )
}
