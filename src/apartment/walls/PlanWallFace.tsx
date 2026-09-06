/**
 * Room wall finishes on a CUSTOM-PLAN wall, in the 3D overview.
 *
 * `PlanShell` draws each wall as one flat-coloured box (the plan's `wallColor`
 * or a per-wall override), so a room's wall FINISH — brick, subway tile,
 * panelling, wallpaper — was invisible in the overview and only appeared once
 * you entered that room's editor (`PlanRoomShell`, which paints the extruded
 * body). Picking a finish and seeing nothing change reads as a broken feature.
 *
 * This adds the missing piece the default flat has had all along
 * (`WallSegment`'s face planes): a thin world-UV plane on each side of a wall
 * box, painted with the finish of whichever room fronts that side. Side ↔ room
 * is resolved by probing a point just off the face (`roomFacingWallSide`), so it
 * works on notched / non-rectangular plans where "away from the plan centre" is
 * the wrong answer.
 *
 * Faces render as CHILDREN of the wall-box mesh so they inherit its transform
 * and can be faded with it — `PlanShell`'s reveal loop copies the box's opacity
 * onto each face material (see `syncFaceFade`), which is why every face clones
 * the shared cached finish material rather than mutating it.
 */

import { Suspense, useMemo } from 'react'
import type { Material, Mesh, MeshStandardMaterial } from 'three'
import type { WallBox } from '../../floorplan/planGeometry'
import { resolvePlanRoomWall } from '../../floorplan/roomFinishes'
import { type PlanRoom, pointInRoom } from '../../floorplan/types'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types'
import {
  useDeferredFinishId,
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial'
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { finishSurfaceUserData } from '../../scene/finishDropTarget'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { useStore } from '../../state/store'
import { useWallFaceMaterial } from './useWallFaceMaterial'
import { isRevealPrepass } from './wallRevealPrepass'
import { useWallTexTransform } from './wallTexTransform'

/** Lift the face off the box so it wins the depth test (matches `WallSegment`). */
const FACE_OFFSET = 0.002

/** Distance past the wall face to probe for the fronting room — far enough to
 *  clear the wall's own thickness slot, near enough to stay in the room. */
const PROBE = 0.15

/**
 * The room fronting one side of a wall box, or `null` for an exterior face.
 * `side` is +1 / -1 along the box's local X (its thickness axis); the box is
 * rotated by `angle` about Y with its length on local Z, so local +X maps to
 * world `(cos angle, -sin angle)`. Pure.
 */
export function roomFacingWallSide(
  rooms: readonly PlanRoom[],
  box: Pick<WallBox, 'cx' | 'cz' | 'angle' | 'thickness'>,
  side: 1 | -1,
): PlanRoom | null {
  const dist = box.thickness / 2 + PROBE
  const x = box.cx + side * Math.cos(box.angle) * dist
  const z = box.cz - side * Math.sin(box.angle) * dist
  return rooms.find((r) => pointInRoom(r, x, z)) ?? null
}

interface FaceProps {
  box: WallBox
  side: 1 | -1
  roomId: string
}

function FaceMesh({ box, side, roomId, material }: FaceProps & { material: MeshStandardMaterial }) {
  const texTransform = useWallTexTransform(roomId, box.wallId)
  const texScale = texTransform?.scale
  const texAngle = texTransform?.angle
  const geometry = useMemo(
    () => worldUvPlaneGeometry(box.length, box.height, { scale: texScale, angle: texAngle }),
    [box.length, box.height, texScale, texAngle],
  )
  // Geometry passed via `geometry=` isn't R3F-owned — dispose it ourselves.
  useDisposeGeometry(geometry)
  // Per-face clone + depth bias + PERF-C swap tracking, shared with WallSegment.
  const faded = useWallFaceMaterial(material)
  return (
    <mesh
      position={[side * (box.thickness / 2 + FACE_OFFSET), 0, 0]}
      rotation={[0, (side * Math.PI) / 2, 0]}
      material={faded}
      geometry={geometry}
      // This plane, not the wall body, is the surface the camera SEES: it sits
      // `FACE_OFFSET` proud of the box and hides it entirely. Without
      // `receiveShadow` it took full unshadowed direct sun at every hour while
      // the body behind it — which does receive — was never visible. That is
      // item `(z3)`: a wall the sun could reach but could never shade.
      //
      // `castShadow` stays FALSE deliberately: the plane is coincident with a
      // body that already casts, so casting twice buys nothing and invites
      // self-shadow acne across a large flat surface.
      receiveShadow
      // Same drop/eyedropper tag the default flat's faces carry, so a canvas
      // finish drop lands on the right room here too.
      userData={finishSurfaceUserData('wall', roomId)}
    />
  )
}

function SolidFace(p: FaceProps & { def: SolidMaterialDef }) {
  return <FaceMesh {...p} material={useSolidMaterial(p.def)} />
}
function TexturedFace(p: FaceProps & { def: TexturedMaterialDef }) {
  return <FaceMesh {...p} material={useTexturedMaterial(p.def)} />
}
function ProceduralFace(p: FaceProps & { def: ProceduralMaterialDef }) {
  return <FaceMesh {...p} material={useProceduralMaterial(p.def)} />
}

function ResolvedFace({ finishId, ...p }: FaceProps & { finishId: MaterialId }) {
  // FINISH-DEFER: resolve the DEFERRED id so a suspending photo finish keeps the
  // current surface on screen instead of blanking it.
  const def = useMaterialDef(useDeferredFinishId(finishId))
  if (def.kind === 'textured') return <TexturedFace def={def} {...p} />
  if (def.kind === 'procedural') return <ProceduralFace def={def} {...p} />
  return <SolidFace def={def} {...p} />
}

/**
 * The finish face for one side of a wall box, or nothing when that side is
 * exterior / the room has no wall finish picked (the plain coloured box then
 * reads exactly as it did before).
 */
export function PlanWallFace({
  box,
  side,
  rooms,
}: {
  box: WallBox
  side: 1 | -1
  rooms: readonly PlanRoom[]
}) {
  const room = useMemo(() => roomFacingWallSide(rooms, box, side), [rooms, box, side])
  const finishId = useStore((s) => {
    if (!room) return null
    // An accent override for this wall+room wins over the room default, exactly
    // as `WallSegment` resolves it for the default flat.
    return (
      s.finishes.wallAccents[`${box.wallId}:${room.id}`] ??
      resolvePlanRoomWall(s.finishes, room) ??
      null
    )
  })
  if (!room || !finishId) return null
  return (
    <SilentErrorBoundary resetKey={finishId}>
      <Suspense fallback={null}>
        <ResolvedFace box={box} side={side} roomId={room.id} finishId={finishId as MaterialId} />
      </Suspense>
    </SilentErrorBoundary>
  )
}

/**
 * Copy a wall box's reveal state onto its finish faces. The faces are children
 * of the box mesh with their own cloned materials, so the fade has to be
 * mirrored rather than inherited. Call from the box's `useFrame`.
 */
export function syncFaceFade(mesh: Mesh, body: MeshStandardMaterial): void {
  for (const child of mesh.children) {
    // Never the wall's own WALL-REVEAL-DEPTH-PREPASS twin: it is colour-less by design and
    // flipping its `transparent` flag would move it out of the transparent pass.
    if (isRevealPrepass(child)) continue
    const m = (child as Mesh).material as Material | undefined
    if (!m || Array.isArray(m)) continue
    const mm = m as MeshStandardMaterial
    if (mm.opacity === body.opacity && mm.transparent === body.transparent) continue
    mm.opacity = body.opacity
    if (mm.transparent !== body.transparent) {
      mm.transparent = body.transparent
      mm.needsUpdate = true
    }
  }
}
