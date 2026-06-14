import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three'
import { useFeature } from '../features/useFeature'
import { levelAsPlan, type PlanLevel, visibleLevels } from '../floorplan/levels'
import { type WallBox, wallBoxes } from '../floorplan/planGeometry'
import { resolvePlanRoomFloor } from '../floorplan/roomFinishes'
import { isSlopedWall, slopedWallTriangles } from '../floorplan/slopedWall'
import {
  DEFAULT_PLAN_WALL_COLOR,
  type FloorPlan,
  type PlanWall,
  planBounds,
  wallLength,
} from '../floorplan/types'
import { isCurvedWall } from '../floorplan/wallArc'
import type { MaterialId } from '../materials/types'
import { useStore } from '../state/store'
import { PlanRoomCeiling } from './floor/PlanRoomCeiling'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { PlanDoorLeaf } from './PlanDoorLeaf'

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
function FadeWall({ box, cx, cz, color }: { box: WallBox; cx: number; cz: number; color: string }) {
  const ref = useRef<Mesh>(null)
  const { camera } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    let target = 1
    // Same wallReveal override the default flat's WallSegment honours (also
    // forced off during panorama capture so walls don't leave holes).
    const revealEnabled = useStore.getState().qualityOverrides.wallReveal ?? true
    if (cameraMode === 'orbit' && revealEnabled) {
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
      <meshStandardMaterial color={color} roughness={0.9} transparent opacity={1} />
    </mesh>
  )
}

/**
 * Lightweight 3D shell for a user-authored floor plan: a grounding slab,
 * neutral per-room floors, and extruded walls with door/window openings (plus
 * glass panes in windows). Used in place of the curated <Apartment/> when a
 * non-default plan is active, so custom apartments are furnishable in 3D.
 * Multi-storey plans (F13) render one `PlanLevelShell` per visible level,
 * each offset by its elevation; the View menu's level control filters via
 * `visibleLevels` (storeys unmount when hidden, so picking can't hit them).
 */
export function PlanShell() {
  const plan = useStore((s) => s.floorPlan)
  const viewLevelId = useStore((s) => s.viewLevelId)
  const wallColor = plan.wallColor ?? DEFAULT_PLAN_WALL_COLOR
  const [ew, ed] = planBounds(plan)
  const levels = visibleLevels(plan, viewLevelId)

  return (
    <group>
      {/* Grounding slab — top kept 10 cm below the plan floors to avoid
          z-fighting (see Apartment.tsx). */}
      <mesh position={[ew / 2, -0.2, ed / 2]} receiveShadow>
        <boxGeometry args={[ew + 0.5, 0.2, ed + 0.5]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} />
      </mesh>

      {levels.map((level) => (
        <group key={level.id} position={[0, level.elevation, 0]}>
          {level.elevation > 0 ? <LevelSlab level={level} /> : null}
          <PlanLevelShell plan={plan} level={level} wallColor={wallColor} cx={ew / 2} cz={ed / 2} />
        </group>
      ))}
    </group>
  )
}

/** Floor slab under an upper storey (bbox of its rooms; top at local y=0). */
function LevelSlab({ level }: { level: PlanLevel }) {
  const rects = level.rooms.map((r) => [r.origin[0], r.origin[1], r.width, r.depth] as const)
  if (rects.length === 0) return null
  const x0 = Math.min(...rects.map((r) => r[0])) - 0.15
  const z0 = Math.min(...rects.map((r) => r[1])) - 0.15
  const x1 = Math.max(...rects.map((r) => r[0] + r[2])) + 0.15
  const z1 = Math.max(...rects.map((r) => r[1] + r[3])) + 0.15
  return (
    <mesh position={[(x0 + x1) / 2, -0.125, (z0 + z1) / 2]} castShadow receiveShadow>
      <boxGeometry args={[x1 - x0, 0.25, z1 - z0]} />
      <meshStandardMaterial color="#b9b4ab" roughness={0.9} />
    </mesh>
  )
}

/** One storey's floors / ceilings / walls / openings, in level-local space
 *  (the parent group applies the elevation offset). All geometry helpers run
 *  on the `levelAsPlan` pseudo-plan, so ground + upper levels share one path. */
function PlanLevelShell({
  plan,
  level,
  wallColor,
  cx,
  cz,
}: {
  plan: FloorPlan
  level: PlanLevel
  wallColor: string
  cx: number
  cz: number
}) {
  const finishes = useStore((s) => s.finishes)
  const crownMolding = useFeature('crownMolding')
  const lp = useMemo(() => levelAsPlan(plan, level), [plan, level])

  const boxes = useMemo(() => lp.walls.flatMap((w) => wallBoxes(lp, w)), [lp])

  // Window glass panes (between sill and head, in the wall gap).
  const windows = useMemo(() => {
    return lp.openings
      .filter((o) => o.kind === 'window')
      .map((o) => {
        const wall = lp.walls.find((w) => w.id === o.wallId)
        // Curved + sloped walls don't host openings in this version.
        if (!wall || isCurvedWall(wall) || isSlopedWall(wall)) return null
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
  }, [lp])

  return (
    <group>
      {/* Per-room floors (catalog finish, defaulting to oak); click-to-enter
          works on every storey (the room editor is level-aware, ML5). */}
      {lp.rooms.map((r) => {
        const mat = resolvePlanRoomFloor(finishes, r) as MaterialId
        const roomId = r.id
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomFloor
              key={r.id}
              roomId={roomId}
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
              roomId={roomId}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              materialId={mat}
            />
            {r.extension && (
              <PlanRoomFloor
                roomId={roomId}
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
          Honour a per-room override, falling back to the level/plan height. */}
      {lp.rooms.map((r) => {
        const h = r.ceilingHeight ?? lp.ceilingHeight
        if (r.polygon && r.polygon.length >= 3) {
          return (
            <PlanRoomCeiling
              key={r.id}
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              height={h}
              polygon={r.polygon}
              ceiling={r.ceiling}
            />
          )
        }
        return (
          <group key={r.id}>
            <PlanRoomCeiling
              origin={r.origin}
              width={r.width}
              depth={r.depth}
              height={h}
              ceiling={r.ceiling}
            />
            {/* An L-extension keeps a plain flat ceiling — the treatment applies
                to the main rectangle only. */}
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
        <FadeWall key={i} box={b} cx={cx} cz={cz} color={wallColor} />
      ))}

      {/* Sloping-top walls render as prisms (slopedWall.ts), not boxes. */}
      {lp.walls.filter(isSlopedWall).map((w) => (
        <SlopedWallMesh key={w.id} wall={w} ceiling={lp.ceilingHeight} color={wallColor} />
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

      {/* Crown molding at the wall–ceiling junction (full-height spans only).
          Uses the same wall-box dimensions as skirting so mitre corners close
          flush; polygonOffset prevents z-fighting against the ceiling plane. */}
      {crownMolding &&
        boxes
          .filter((b) => b.cy + b.height / 2 >= lp.ceilingHeight - 0.01)
          .map((b, i) => (
            <mesh
              key={`cm${i}`}
              position={[b.cx, lp.ceilingHeight - 0.035, b.cz]}
              rotation={[0, b.angle, 0]}
            >
              <boxGeometry args={[b.thickness + 0.024, 0.07, b.length]} />
              <meshStandardMaterial
                color="#eeece6"
                roughness={0.55}
                metalness={0}
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-2}
              />
            </mesh>
          ))}

      {/* Door leaves — swinging, clickable; closed by default (matches collision). */}
      {lp.openings
        .filter((o) => o.kind === 'door')
        .map((o) => {
          const wall = lp.walls.find((w) => w.id === o.wallId)
          // Curved + sloped walls don't host openings in this version.
          return wall && !isCurvedWall(wall) && !isSlopedWall(wall) ? (
            <PlanDoorLeaf key={o.id} wall={wall} opening={o} cx={cx} cz={cz} />
          ) : null
        })}

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

/** A sloping-top wall rendered as a prism (PARITY-SLOPEWALL). The triangle soup
 *  is already in world coordinates, so the mesh sits at the origin; flat normals
 *  come from `computeVertexNormals` on the unshared verts. */
function SlopedWallMesh({
  wall,
  ceiling,
  color,
}: {
  wall: PlanWall
  ceiling: number
  color: string
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(slopedWallTriangles(wall, ceiling), 3))
    g.computeVertexNormals()
    return g
  }, [wall, ceiling])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  )
}
