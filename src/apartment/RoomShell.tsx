import { Suspense, useEffect, useMemo, useRef } from 'react'
import { type Mesh, type MeshStandardMaterial, Vector2 } from 'three'
import { useShallow } from 'zustand/react/shallow'
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
import { DOORS, WINDOWS } from './constants'
import { DoorLeaf } from './Door'
import { RoomFloor } from './floor/RoomFloor'
import { type ClippedWall, clippedWallCutouts, type RoomShell as RoomShellData } from './roomShell'
import { WindowPane } from './Window'
import { localOuterZSign, wallThicknessMetres } from './wallSegments'
import { useWallReveal } from './walls/useWallReveal'
import { extrudeWallBody, getWallStructureMaterial } from './walls/wallBodyGeometry'
import { OPENING_CLEARANCE, wallBodyOutlineFromSpans } from './walls/wallBodyShape'

/** A clipped wall box, painted with the room's wall finish, that fades to
 *  translucent when the orbit camera fronts it — so you always see into the
 *  room (IKEA-planner-style camera-facing wall reveal, matching orbit mode). */
function WallBox({
  wall,
  center,
  material,
  roomId,
  startAbut,
  endAbut,
  startSlope,
  endSlope,
  bias,
}: {
  wall: ClippedWall
  center: [number, number]
  material: MeshStandardMaterial
  /** The isolated room this clipped wall belongs to (finish-drop target tag). */
  roomId: string
  /** Half-thickness of the perpendicular wall this clip abuts at each end, so the
   *  body extends past the interior corner to CLOSE it flush (matching the orbit
   *  scene) instead of ending at the interior edge — the "two disjoint walls at a
   *  corner" look. 0 for a free end. */
  startAbut: number
  endAbut: number
  /** Mitre-cut slope for each end (`a = ±halfLen + slope·z`), or null for a buried
   *  butt join. Encodes convex/concave direction + thickness ratio. */
  startSlope: number | null
  endSlope: number | null
  /** Distinct per-wall depth bias (its index in the room) → passed to the reveal
   *  so any non-mitred (buried) corner walls don't z-fight (deterministic winner). */
  bias: number
}) {
  const ref = useRef<Mesh>(null)
  const ceilingHeight = useStore((s) => s.floorPlan.ceilingHeight)
  // Re-render this wall when the plan-wide default OR per-wall overrides change
  // (resolved metres come from the module-level holder in `wallThicknessMetres`).
  useStore((s) => s.floorPlan.wallThickness)
  useStore((s) => s.floorPlan.walls)
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const len = Math.hypot(ex - sx, ez - sz)
  const midX = (sx + ex) / 2
  const midZ = (sz + ez) / 2

  // Outward normal: from room centre toward the wall mid along the wall's
  // facing axis (the wall is axis-aligned).
  const toMid = new Vector2(midX - center[0], midZ - center[1])
  const horizontal = Math.abs(ez - sz) < 1e-3 // runs along X → faces ±Z
  const normal = horizontal
    ? new Vector2(0, Math.sign(toMid.y) || 1)
    : new Vector2(Math.sign(toMid.x) || 1, 0)

  // Fade to translucent when the orbit camera fronts this wall (matches the main
  // orbit scene); publishes the wall's opacity so its windows/doors fade too.
  useWallReveal(ref, {
    midX,
    midZ,
    nx: normal.x,
    nz: normal.y,
    center,
    wallId: wall.wallId,
    bias,
  })

  const t = wallThicknessMetres(wall.spec)
  const h = wall.spec.topHeight ?? ceilingHeight
  // Which of the body's two thickness caps faces the room INTERIOR — so the
  // extruded body can paint only that cap with the wall finish (group 0) and keep
  // the outer cap + top + ends structural white (group 1). The body is rotated by
  // [0, -angle, 0], under which its local +Z maps to world (-dzn, dxn); the inner
  // cap is the one whose outward normal points opposite the room-outward normal.
  const dxn = (ex - sx) / (len || 1)
  const dzn = (ez - sz) / (len || 1)
  const localZOutwardDot = -dzn * normal.x + dxn * normal.y
  const innerFaceZSign = localZOutwardDot > 0 ? -1 : 1
  // A single watertight extruded body with the wall's door/window openings
  // carved out (matching the main orbit scene), so an opaque wall no longer
  // occludes the door/window sitting inside it — the box had no cutouts, so the
  // openings vanished the moment the wall stopped fading (only the fade let you
  // see "through" it). Floor-anchored (y 0..h), so position sits at y=0. Split
  // into finish (inner face) + white (rest) material groups.
  const bodyGeometry = useMemo(
    () =>
      extrudeWallBody(
        wallBodyOutlineFromSpans(
          clippedWallCutouts(wall),
          -len / 2 - startAbut,
          len / 2 + endAbut,
          h,
          OPENING_CLEARANCE,
        ),
        t,
        innerFaceZSign,
        startSlope !== null || endSlope !== null
          ? {
              halfLen: len / 2,
              startSlope: startSlope ?? undefined,
              endSlope: endSlope ?? undefined,
            }
          : undefined,
      ),
    [wall, len, h, t, startAbut, endAbut, innerFaceZSign, startSlope, endSlope],
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
      // [finish, structural-white]: the grouped body paints only the interior
      // room-facing cap with the finish; the top/outer/ends stay white.
      material={[material, getWallStructureMaterial()]}
      geometry={bodyGeometry}
      // In the isolated room editor every clipped wall belongs to this room, so
      // tag it as a wall drop target (scene/finishDropTarget.ts).
      userData={finishSurfaceUserData('wall', roomId)}
    />
  )
}

// Resolve a wall finish materialId to a MeshStandardMaterial, branching by
// kind exactly like the floor path so procedural/textured/solid all work.
interface WallDispatchProps {
  wall: ClippedWall
  center: [number, number]
  roomId: string
  startAbut: number
  endAbut: number
  startSlope: number | null
  endSlope: number | null
  bias: number
}
function SolidWall(p: WallDispatchProps & { def: SolidMaterialDef }) {
  return <WallBox {...p} material={useSolidMaterial(p.def)} />
}
function TexturedWall(p: WallDispatchProps & { def: TexturedMaterialDef }) {
  return <WallBox {...p} material={useTexturedMaterial(p.def)} />
}
function ProceduralWall(p: WallDispatchProps & { def: ProceduralMaterialDef }) {
  return <WallBox {...p} material={useProceduralMaterial(p.def)} />
}

function RoomWall({ materialId, ...p }: WallDispatchProps & { materialId: MaterialId }) {
  const def = useMaterialDef(materialId)
  const inner =
    def.kind === 'textured' ? (
      <TexturedWall def={def} {...p} />
    ) : def.kind === 'procedural' ? (
      <ProceduralWall def={def} {...p} />
    ) : (
      <SolidWall def={def} {...p} />
    )
  return (
    <SilentErrorBoundary resetKey={def.id}>
      <Suspense fallback={null}>{inner}</Suspense>
    </SilentErrorBoundary>
  )
}

/** A clipped wall's outward (away-from-room-centre) unit normal, axis-aligned. */
function clippedOutward(w: ClippedWall, center: [number, number]): { nx: number; nz: number } {
  const midX = (w.start[0] + w.end[0]) / 2
  const midZ = (w.start[1] + w.end[1]) / 2
  const horizontal = Math.abs(w.end[1] - w.start[1]) < 1e-3
  return horizontal
    ? { nx: 0, nz: Math.sign(midZ - center[1]) || 1 }
    : { nx: Math.sign(midX - center[0]) || 1, nz: 0 }
}

/** How each end of a clipped wall meets its neighbour so corners read as ONE clean
 *  surface. A true corner is MITRED to the angle-bisector (each wall takes half),
 *  with the diagonal slope derived from the neighbour's outward normal (correct at
 *  convex AND concave corners) and the thickness ratio (so different-thickness
 *  walls meet with no gap). Both mitred end-faces are exactly coincident with
 *  opposite normals → backface culling draws only one → seamless (no doubled
 *  translucency, no z-fight). `abut` extends by the neighbour's half-thickness so
 *  the long side reaches the outer corner; `slope` (null → no mitre) is the cut
 *  `a = ±halfLen + slope·z` for `extrudeWallBody`. */
function cornerMiters(
  wall: ClippedWall,
  walls: ClippedWall[],
  center: [number, number],
): { startAbut: number; endAbut: number; startSlope: number | null; endSlope: number | null } {
  const near = (p: [number, number], q: [number, number]) =>
    Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.25
  const dxW = wall.end[0] - wall.start[0]
  const dzW = wall.end[1] - wall.start[1]
  const lenW = Math.hypot(dxW, dzW) || 1
  const thisOut = clippedOutward(wall, center)
  const s = localOuterZSign(dxW, dzW, thisOut.nx, thisOut.nz)
  const tThis = wallThicknessMetres(wall.spec)
  const joinAt = (pt: [number, number]): { abut: number; slope: number | null } => {
    for (const o of walls) {
      if (o === wall) continue
      if (near(o.start, pt) || near(o.end, pt)) {
        const nb = clippedOutward(o, center)
        const eB = nb.nx * (dxW / lenW) + nb.nz * (dzW / lenW) >= 0 ? 1 : -1
        const tNb = wallThicknessMetres(o.spec)
        return { abut: tNb / 2, slope: (eB * s * tNb) / tThis }
      }
    }
    return { abut: 0, slope: null }
  }
  const sJ = joinAt(wall.start)
  const eJ = joinAt(wall.end)
  return { startAbut: sJ.abut, endAbut: eJ.abut, startSlope: sJ.slope, endSlope: eJ.slope }
}

/** Renders only the walls of an isolated room (clipped to its footprint) plus
 *  per-rect floors. Floor + wall finishes follow the store's per-room picks
 *  (with accent-wall overrides). Lightweight: no ceiling, no skirting, no
 *  exterior. Windows/doors are filtered to the room's own openings. */
export function RoomShell({ shell }: { shell: RoomShellData }) {
  const roomId = shell.roomId
  const floorFinish = useStore((s) => s.finishes.floor[roomId])
  const wallFinish = useStore((s) => s.finishes.walls[roomId])
  const wallAccents = useStore(useShallow((s) => s.finishes.wallAccents))
  const windowSet = new Set(shell.windowIds)
  const doorSet = new Set(shell.doorIds)
  return (
    <group>
      {shell.rects.map((r, i) => (
        <RoomFloor
          key={`floor-${i}`}
          roomId={roomId}
          origin={[r.x0, r.z0]}
          width={r.x1 - r.x0}
          depth={r.z1 - r.z0}
          materialId={floorFinish}
        />
      ))}
      {shell.walls.map((w, i) => {
        const { startAbut, endAbut, startSlope, endSlope } = cornerMiters(
          w,
          shell.walls,
          shell.center,
        )
        return (
          <RoomWall
            key={`${w.wallId}-${i}`}
            // An accent override for this wall in this room wins over the room
            // wall finish, matching WallSegment's resolution.
            materialId={wallAccents[`${w.wallId}:${roomId}`] ?? wallFinish}
            wall={w}
            center={shell.center}
            roomId={roomId}
            startAbut={startAbut}
            endAbut={endAbut}
            startSlope={startSlope}
            endSlope={endSlope}
            bias={i}
          />
        )
      })}
      {WINDOWS.filter((w) => windowSet.has(w.id)).map((w) => (
        <WindowPane key={w.id} spec={w} />
      ))}
      {DOORS.filter((d) => doorSet.has(d.id)).map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  )
}
