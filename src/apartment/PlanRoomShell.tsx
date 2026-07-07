import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, Mesh, MeshStandardMaterial, Vector2 } from 'three'
import {
  type PlanClippedWall,
  type PlanRoomOpening,
  planOpeningCutout,
  type PlanRoomShell as Shell,
} from '../floorplan/planRoomShell'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../floorplan/roomFinishes'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../materials/types'
import {
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../materials/useMaterial'
import { finishSurfaceUserData } from '../scene/finishDropTarget'
import { SilentErrorBoundary } from '../scene/SilentErrorBoundary'
import { useStore } from '../state/store'
import { PlanRoomFloor } from './floor/PlanRoomFloor'
import { useWallReveal } from './walls/useWallReveal'
import { extrudeWallBody } from './walls/wallBodyGeometry'
import {
  OPENING_CLEARANCE,
  type WallCutoutSpan,
  wallBodyOutlineFromSpans,
} from './walls/wallBodyShape'
import { getWallOpacity } from './walls/wallReveal'
import { cornerNeighbors } from './walls/wallRevealMath'

const WALL_COLOR = '#ede9e2' // matches PlanShell's plaster walls
const DOOR_COLOR = '#8a6d4f'
const GLASS_COLOR = '#bcd6e6'

function clippedThickness(t: PlanClippedWall['thickness']): number {
  return t === 'external' ? 0.2 : 0.1
}

interface WallBoxProps {
  wall: PlanClippedWall
  center: [number, number]
  height: number
  /** Door/window openings on this wall, in the clip's centred along-axis frame. */
  cutouts: WallCutoutSpan[]
  /** The isolated room this clipped wall belongs to (finish-drop target tag). */
  roomId: string
  /** Ids of the room's walls sharing a corner with this one (corner-spread). */
  cornerWallIds?: readonly string[]
}

/** A clipped plan wall that fades to translucent when the orbit camera fronts it
 *  — the IKEA-planner camera-facing reveal, mirroring `apartment/RoomShell`'s
 *  WallBox but for plan walls. Rendered as a single watertight extruded body
 *  with its door/window openings carved out (matching the main orbit scene), so
 *  an opaque wall no longer occludes the leaf/pane inside it. Carries the
 *  resolved room finish (or plain plaster when unset) on the body directly. */
function WallBoxBody({
  wall,
  center,
  height,
  cutouts,
  roomId,
  cornerWallIds,
  material,
}: WallBoxProps & { material: MeshStandardMaterial }) {
  const ref = useRef<Mesh>(null)
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

  // Fade the wall to translucent when the orbit camera fronts it — matches the
  // main orbit scene's wall reveal (also publishes opacity for its openings).
  useWallReveal(ref, {
    midX,
    midZ,
    nx: normal.x,
    nz: normal.y,
    center,
    wallId: wall.wallId,
    cornerWallIds,
  })

  const t = clippedThickness(wall.thickness)
  const h = wall.topHeight ?? height
  const bodyGeometry = useMemo(
    () =>
      extrudeWallBody(
        wallBodyOutlineFromSpans(cutouts, -len / 2, len / 2, h, OPENING_CLEARANCE),
        t,
      ),
    [cutouts, len, h, t],
  )
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry])

  if (len < 1e-6) return null
  const angle = Math.atan2(ez - sz, ex - sx)
  return (
    <mesh
      ref={ref}
      position={[midX, 0, midZ]}
      rotation={[0, -angle, 0]}
      castShadow={false}
      material={material}
      geometry={bodyGeometry}
      // In the isolated room editor every clipped wall belongs to this room, so
      // tag it as a wall drop target (scene/finishDropTarget.ts).
      userData={finishSurfaceUserData('wall', roomId)}
    />
  )
}

// Resolve the room wall finish to a MeshStandardMaterial, branching by kind
// (mirrors RoomShell's wall dispatch); a null finish falls back to plaster.
function SolidWallBody(p: WallBoxProps & { def: SolidMaterialDef }) {
  return <WallBoxBody {...p} material={useSolidMaterial(p.def)} />
}
function TexturedWallBody(p: WallBoxProps & { def: TexturedMaterialDef }) {
  return <WallBoxBody {...p} material={useTexturedMaterial(p.def)} />
}
function ProceduralWallBody(p: WallBoxProps & { def: ProceduralMaterialDef }) {
  return <WallBoxBody {...p} material={useProceduralMaterial(p.def)} />
}

function FinishWallBody({ finishId, ...p }: WallBoxProps & { finishId: MaterialId }) {
  const def = useMaterialDef(finishId)
  if (def.kind === 'textured') return <TexturedWallBody def={def} {...p} />
  if (def.kind === 'procedural') return <ProceduralWallBody def={def} {...p} />
  return <SolidWallBody def={def} {...p} />
}

function PlasterWallBody(p: WallBoxProps) {
  const material = useMemo(
    () => new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9 }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  return <WallBoxBody {...p} material={material} />
}

function WallBox({ finishId, ...p }: WallBoxProps & { finishId: MaterialId | null }) {
  if (!finishId) return <PlasterWallBody {...p} />
  return (
    <SilentErrorBoundary resetKey={finishId}>
      <Suspense fallback={<PlasterWallBody {...p} />}>
        <FinishWallBody finishId={finishId} {...p} />
      </Suspense>
    </SilentErrorBoundary>
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
      // depthWrite stays ON at all times (WALL-FADE-DEPTHWRITE, matching the host
      // wall) so the opening fades as one clean self-occluding surface and sorts
      // consistently with the wall, instead of popping 2D↔3D mid-fade or bleeding
      // the backdrop through the wall/opening overlap.
      mat.depthWrite = true
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

  // Corner adjacency between the room's clipped walls (WALL-REVEAL-CORNER-SPREAD).
  // Same 0.25 m epsilon as RoomShell — clipped endpoints can sit up to a neighbour
  // half-thickness short of the true corner.
  const cornerIds = useMemo(
    () =>
      cornerNeighbors(
        shell.walls.map((w) => ({ id: w.wallId, start: w.start, end: w.end })),
        0.25,
      ),
    [shell.walls],
  )

  // Group each wall's openings so its body can carve them out as holes/notches.
  const cutoutsByWall = new Map<string, WallCutoutSpan[]>()
  const clipById = new Map(shell.walls.map((w) => [w.wallId, w]))
  for (const entry of shell.openings) {
    const clip = clipById.get(entry.opening.wallId)
    if (!clip) continue
    const list = cutoutsByWall.get(entry.opening.wallId) ?? []
    list.push(planOpeningCutout(entry, clip))
    cutoutsByWall.set(entry.opening.wallId, list)
  }

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
          cutouts={cutoutsByWall.get(w.wallId) ?? []}
          finishId={wallMat}
          roomId={room.id}
          cornerWallIds={cornerIds.get(w.wallId)}
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
