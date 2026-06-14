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
import { isCurvedWall, pointAtArcLength } from '../floorplan/wallArc'
import type { MaterialId } from '../materials/types'
import { useStore } from '../state/store'
import { PlanRoomCeiling } from './floor/PlanRoomCeiling'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { PlanDoorLeaf } from './PlanDoorLeaf'

/**
 * One plan wall, fading out in orbit mode when it sits between the camera and
 * the plan centre (so the dollhouse view isn't blocked by near walls).
 */
/** smoothstep — matches the default flat's WallSegment reveal ramp. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Camera-facing reveal factor (1 = opaque, ~0 = faded) for a point at (px,pz)
 *  relative to the plan centre (cx,cz). Wide ramp so near + grazing walls fade. */
function revealFactor(
  camera: { position: { x: number; z: number } },
  px: number,
  pz: number,
  cx: number,
  cz: number,
): number {
  const kx = camera.position.x - px
  const kz = camera.position.z - pz
  const dcx = cx - px
  const dcz = cz - pz
  const mag = Math.hypot(kx, kz) * Math.hypot(dcx, dcz) || 1
  const d = (kx * dcx + kz * dcz) / mag // −1 near (facing camera), +1 far
  return smoothstep(-0.2, 0.25, d)
}

function FadeWall({ box, cx, cz, color }: { box: WallBox; cx: number; cz: number; color: string }) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
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
      target = Math.max(0.12, revealFactor(camera, box.cx, box.cz, cx, cz))
    }
    mat.opacity += (target - mat.opacity) * 0.18
    mat.transparent = mat.opacity < 0.98
    mat.depthWrite = mat.opacity > 0.6
    // frameloop="demand": keep rendering until the fade settles (else it freezes
    // mid-fade when the camera stops).
    if (Math.abs(mat.opacity - target) > 0.005) invalidate()
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

  // Skirting strips along floor-reaching wall spans, carrying each wall's
  // optional per-wall baseboard override (PARITY-BASEBOARD): height + colour, or
  // hidden. Built per wall (not from the flattened `boxes`) so the override is
  // in scope; defaults match the shell skirting (0.09 m, off-white).
  const skirtings = useMemo(() => {
    const out: { box: WallBox; height: number; color: string }[] = []
    for (const w of lp.walls) {
      const bb = w.baseboard
      if (bb?.hidden) continue
      const height = bb?.height && bb.height > 0 ? bb.height : 0.09
      const color = bb?.color ?? '#eceae4'
      for (const box of wallBoxes(lp, w)) {
        if (box.cy - box.height / 2 < 0.01) out.push({ box, height, color })
      }
    }
    return out
  }, [lp])

  // Window glass panes (between sill and head, in the wall gap).
  const windows = useMemo(() => {
    return lp.openings
      .filter((o) => o.kind === 'window')
      .map((o) => {
        const wall = lp.walls.find((w) => w.id === o.wallId)
        // Sloped walls (solid prism) don't host openings. Curved walls do — the
        // glass is positioned + oriented at the opening's mid-arc point.
        if (!wall || isSlopedWall(wall)) return null
        const s = o.offset + o.width / 2
        let cx: number
        let cz: number
        let angle: number
        if (isCurvedWall(wall)) {
          const p = pointAtArcLength(wall, s)
          cx = p.x
          cz = p.z
          angle = p.angle
        } else {
          const len = wallLength(wall)
          if (len === 0) return null
          const dx = (wall.end[0] - wall.start[0]) / len
          const dz = (wall.end[1] - wall.start[1]) / len
          angle = Math.atan2(dx, dz)
          cx = wall.start[0] + dx * s
          cz = wall.start[1] + dz * s
        }
        return {
          id: o.id,
          cx,
          cz,
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
        // Per-room floor-texture transform (SweetHome3DJS scale/angle parity).
        const texTransform =
          r.floorTexScale || r.floorTexAngle
            ? { scale: r.floorTexScale, angle: r.floorTexAngle }
            : undefined
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
              texTransform={texTransform}
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
              texTransform={texTransform}
            />
            {r.extension && (
              <PlanRoomFloor
                roomId={roomId}
                origin={[r.origin[0] + r.extension.offset[0], r.origin[1] + r.extension.offset[1]]}
                width={r.extension.width}
                depth={r.extension.depth}
                materialId={mat}
                texTransform={texTransform}
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

      {/* Skirting along floor-reaching wall spans (per-wall baseboard override:
          height/colour, or hidden — PARITY-BASEBOARD). */}
      {skirtings.map(({ box: b, height, color }, i) => (
        <mesh
          key={`sk${i}`}
          position={[b.cx, height / 2, b.cz]}
          rotation={[0, b.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[b.thickness + 0.024, height, b.length]} />
          <meshStandardMaterial color={color} roughness={0.7} />
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
          // Sloped walls (solid prism) don't host openings; curved walls do
          // (PlanDoorLeaf reads arc-aware geometry from doorSwingGeometry).
          return wall && !isSlopedWall(wall) ? (
            <PlanDoorLeaf key={o.id} wall={wall} opening={o} cx={cx} cz={cz} />
          ) : null
        })}

      {/* Window glass — fades with its wall during the orbit reveal (FadeWindow). */}
      {windows.map((w) => (
        <FadeWindow key={w.id} win={w} cx={cx} cz={cz} />
      ))}
    </group>
  )
}

/** Window glass pane that fades out (like FadeWall) when it sits between the
 *  orbit camera and the plan centre — so it doesn't stay opaque in a wall that's
 *  gone translucent. */
function FadeWindow({
  win,
  cx,
  cz,
}: {
  win: { cx: number; cz: number; cy: number; width: number; height: number; angle: number }
  cx: number
  cz: number
}) {
  const ref = useRef<Mesh>(null)
  const { camera, invalidate } = useThree()
  const cameraMode = useStore((s) => s.cameraMode)
  const BASE = 0.32
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const mat = mesh.material as MeshStandardMaterial
    let factor = 1
    const revealEnabled = useStore.getState().qualityOverrides.wallReveal ?? true
    if (cameraMode === 'orbit' && revealEnabled) {
      factor = Math.max(0.12, revealFactor(camera, win.cx, win.cz, cx, cz))
    }
    const target = BASE * factor
    mat.opacity += (target - mat.opacity) * 0.18
    if (Math.abs(mat.opacity - target) > 0.003) invalidate()
  })
  return (
    <mesh ref={ref} position={[win.cx, win.cy, win.cz]} rotation={[0, win.angle, 0]}>
      <boxGeometry args={[0.03, win.height, win.width]} />
      <meshStandardMaterial
        color="#bcd6e6"
        transparent
        opacity={BASE}
        roughness={0.1}
        metalness={0}
      />
    </mesh>
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
