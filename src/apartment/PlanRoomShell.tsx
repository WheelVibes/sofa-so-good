import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { type Group, Mesh, MeshStandardMaterial, Vector2 } from 'three'
import { useFeature } from '../features/useFeature'
import { roomFloorOffsetM, wallBaseExtensionM } from '../floorplan/floorLevels3d'
import {
  type PlanClippedWall,
  type PlanRoomOpening,
  planOpeningCutout,
  type PlanRoomShell as Shell,
} from '../floorplan/planRoomShell'
import { resolvePlanRoomFloor, resolvePlanRoomWall } from '../floorplan/roomFinishes'
import { wallTypeOverlayColor } from '../floorplan/wallTypeColor'
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
import { roomShellThresholdRects } from './floor/planThresholdRects'
import type { ThresholdRect } from './floor/thresholdRects'
import { useWallReveal } from './walls/useWallReveal'
import { WallTypeOverlayJacket } from './walls/WallSegment'
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

  // Wall-types 3D overlay (`wallTypes3d` pro flag) — same tint as the default
  // flat's `WallSegment`/`RoomShell`, so a custom plan's room editor shows the
  // classification too.
  const wallTypes3dFlag = useFeature('wallTypes3d')
  const showWallTypesToggle = useStore((s) => s.showWallTypes)
  const overlayColor =
    wallTypes3dFlag && showWallTypesToggle ? wallTypeOverlayColor(wall.structure) : null

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
    <>
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
      {/* Wall-types 3D overlay (`wallTypes3d` pro flag) — a SIBLING of the
          ref'd mesh above (never a child; `useWallReveal` reads `ref.current`
          directly, a leaf mesh with no children here, so this doesn't
          interfere either way, but siblings keep the pattern identical to
          `WallSegment`/`RoomShell`). */}
      {overlayColor && (
        <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
          <WallTypeOverlayJacket length={len} height={h} thickness={t} color={overlayColor} />
        </group>
      )}
    </>
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

// Threshold patch sizing (DOOR-GAP-LEAK, room-editor analog): slab thickness
// below the top face + a top-face lift 1 mm under the 0.006 PlanRoomFloor lift,
// matching PlanShell's FadeThreshold so orbit and room editor look alike.
const THRESHOLD_H = 0.02
const THRESHOLD_LIFT = 0.005

/** Floor patches under the isolated room's doorways (DOOR-GAP-LEAK). The room
 *  editor draws only this room's floor and its wall bodies are carved to y=0 at
 *  each door, so without these the wall-thickness slot under a door leaf was a
 *  hole straight to the backdrop (no `UnroomedFloor` here — it read as a bright
 *  strip). Each patch fades with its host wall via the same `getWallOpacity`
 *  registry the openings use (mirrors the default flat's `Thresholds`). */
function PlanRoomThresholds({ shell }: { shell: Shell }) {
  const rects = useMemo<ThresholdRect[]>(() => {
    const byId = new Map(shell.walls.map((w) => [w.wallId, w]))
    return roomShellThresholdRects(shell.openings, (wallId) => {
      const clip = byId.get(wallId)
      return clip ? clippedThickness(clip.thickness) : 0.1
    })
  }, [shell])

  const groupRef = useRef<Group>(null)
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    for (let i = 0; i < g.children.length && i < rects.length; i++) {
      const mesh = g.children[i] as Mesh
      const mat = mesh.material as MeshStandardMaterial
      if (!mat) continue
      const op = getWallOpacity(rects[i].wallId)
      mesh.visible = op > 0.02
      const next = op < 0.985
      // Toggling `transparent` at runtime needs a recompile to blend (see
      // WallSegment); flip needsUpdate only on the actual transition.
      if (next !== mat.transparent) mat.needsUpdate = true
      mat.transparent = next
      mat.opacity = op
      // depthWrite stays ON (WALL-FADE-DEPTHWRITE), same as every reveal surface.
      mat.depthWrite = true
    }
  })

  return (
    <group ref={groupRef}>
      {rects.map((r, i) => (
        <mesh
          key={i}
          position={[r.cx, THRESHOLD_LIFT - THRESHOLD_H / 2, r.cz]}
          rotation={[0, r.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[r.depth, THRESHOLD_H, r.length]} />
          {/* Hardwood threshold strip — matches Thresholds/PlanShell. */}
          <meshStandardMaterial color="#7d6243" roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

/** A plain plinth box filling the gap between a lowered room's floor and the
 *  wall base (BSJ-8 follow-up — walls stay at their datum y=0; only the floor
 *  moves, so a negative `floorLevelMm` would otherwise show daylight under the
 *  wall). Sits flush against the wall's inner face, plaster-tinted (a floor
 *  finish never shows here — it's a thin structural upstand, not a floor). No
 *  render when the room isn't lowered (`extension` is 0). */
function WallBasePlinth({
  wall,
  extension,
}: {
  wall: PlanClippedWall
  /** Downward extension (m, > 0) — {@link wallBaseExtensionM}. */
  extension: number
}) {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const len = Math.hypot(ex - sx, ez - sz)
  if (len < 1e-6 || extension <= 0) return null
  const midX = (sx + ex) / 2
  const midZ = (sz + ez) / 2
  const angle = Math.atan2(ez - sz, ex - sx)
  const t = clippedThickness(wall.thickness)
  // Length along local X — same frame as WallBoxBody's extruded outline
  // (spans -len/2..len/2 on X, thickness on Z) under the same -angle rotation.
  return (
    <mesh position={[midX, -extension / 2, midZ]} rotation={[0, -angle, 0]} receiveShadow>
      <boxGeometry args={[len, extension, t]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
  )
}

/**
 * Renders one isolated room of a **custom floor plan** for the per-room editor —
 * the plan-data analogue of `apartment/RoomShell`. Per-rect (or polygon) floors
 * with the room's own floor finish, walls clipped to the room footprint (with
 * camera-facing reveal), plus door/window panels for the room's openings (placed
 * from the `PlanRoomShell`'s resolved opening centres + angles).
 *
 * **Floor levels (BSJ-8 follow-up, `floorLevels` flag):** when the room carries
 * an explicit `floorLevelMm`, its floor plane + doorway thresholds are offset by
 * `floorLevelMm/1000` (metres) while the walls/ceiling stay at the plan datum —
 * an FFL change is a slab build-up difference, not a storey change. A lowered
 * floor gets a plinth ({@link WallBasePlinth}) filling the gap under each wall so
 * no daylight shows through at the base.
 */
export function PlanRoomShell({ shell }: { shell: Shell }) {
  const planHeight = useStore((s) => s.floorPlan.ceilingHeight)
  const finishes = useStore((s) => s.finishes)
  const room = shell.room
  const height = room.ceilingHeight ?? planHeight
  const floorMat = resolvePlanRoomFloor(finishes, room) as MaterialId
  const wallMat = resolvePlanRoomWall(finishes, room) as MaterialId | null
  const floorLevelsOn = useFeature('floorLevels')
  const offsetM = roomFloorOffsetM(room, floorLevelsOn)
  const wallExtension = wallBaseExtensionM(offsetM)

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
      {/* Floors + doorway thresholds ride the room's FFL offset (BSJ-8
          follow-up); walls/ceiling stay at the plan datum. */}
      <group position={[0, offsetM, 0]}>
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

        {/* Doorway threshold strips — fill the unfloored wall-thickness slot under
            each door so the backdrop can't shine through (DOOR-GAP-LEAK). */}
        <PlanRoomThresholds shell={shell} />
      </group>

      {/* Plinth filling the gap under each wall for a lowered floor — walls
          themselves stay at the datum (an FFL change is a slab build-up, not a
          storey change). */}
      {wallExtension > 0 &&
        shell.walls.map((w, i) => (
          <WallBasePlinth key={`plinth-${w.wallId}-${i}`} wall={w} extension={wallExtension} />
        ))}

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
