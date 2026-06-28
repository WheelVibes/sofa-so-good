import { Suspense, useMemo } from 'react'
import { BackSide, MeshStandardMaterial } from 'three'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { CeilingConfig } from '../../floorplan/types'
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types'
import {
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial'
import { worldUvPlaneGeometry, worldUvShapeGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'
import { RoomCeiling } from '../ceiling/RoomCeiling'

/**
 * A flat ceiling for a user-authored plan room, placed at the room's ceiling
 * height. It reuses {@link PlanRoomFloor}'s exact footprint placement (rect via
 * `worldUvPlaneGeometry`, polygon via `worldUvShapeGeometry`).
 *
 * Default (no finish): a uniform white plane rendered **back side only** (via
 * `CEILING_MATERIAL`) so it reads from below (walk mode) yet is culled from the
 * orbit/dollhouse view above. A per-room **finish** (CUSTOMIZE-CEILING) instead
 * resolves any catalog material — colour / wood / plaster / tile / CC0 — exactly
 * like the floor, but the down-facing plane is wrapped in a negative-Y-scale
 * mirror group so the (front-side) catalog material renders on the downward face
 * and stays culled from above, without cloning/mutating the shared cached
 * material (which the procedural worker swap path may dispose textures on).
 */
interface Props {
  origin: [number, number]
  width: number
  depth: number
  height: number
  polygon?: [number, number][]
  /** Optional ceiling treatment (tray/coffered/dropped). Absent → flat. */
  ceiling?: CeilingConfig
  /** Optional per-room ceiling finish (catalog material id). Absent/null → the
   *  plain white ceiling. Only applies to the flat ceiling — a *designed*
   *  (tray/coffered/dropped/sloped) ceiling keeps the plain treatment for now. */
  materialId?: string | null
}

// One shared material: uniform matte white, back-faces only (downward-facing).
const CEILING_MATERIAL = new MeshStandardMaterial({
  color: '#fafafa',
  roughness: 1,
  side: BackSide,
})

/** The finished down-facing ceiling plane. The mesh keeps the floor's exact
 *  geometry/placement (`[-π/2]` rotation), and the parent group mirrors across
 *  the plane's own Y so the front-side catalog material faces down (and is
 *  culled from above) — a pure transform, no material mutation. */
function CeilingPlane({
  position,
  geometry,
  material,
}: {
  position: [number, number, number]
  geometry: ReturnType<typeof worldUvPlaneGeometry>
  material: MeshStandardMaterial
}) {
  return (
    <group position={[0, position[1], 0]} scale={[1, -1, 1]}>
      <mesh
        position={[position[0], 0, position[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={material}
        geometry={geometry}
      />
    </group>
  )
}

function Solid(p: PlaneProps & { def: SolidMaterialDef }) {
  const { def, ...rest } = p
  return <CeilingPlane {...rest} material={useSolidMaterial(def)} />
}
function Textured(p: PlaneProps & { def: TexturedMaterialDef }) {
  const { def, ...rest } = p
  return <CeilingPlane {...rest} material={useTexturedMaterial(def)} />
}
function Procedural(p: PlaneProps & { def: ProceduralMaterialDef }) {
  const { def, ...rest } = p
  return <CeilingPlane {...rest} material={useProceduralMaterial(def)} />
}

interface PlaneProps {
  position: [number, number, number]
  geometry: ReturnType<typeof worldUvPlaneGeometry>
}

function FinishedInner({ materialId, ...rest }: PlaneProps & { materialId: MaterialId }) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <Textured def={def} {...rest} />
  if (def.kind === 'procedural') return <Procedural def={def} {...rest} />
  return <Solid def={def} {...rest} />
}

export function PlanRoomCeiling({
  origin,
  width,
  depth,
  height,
  polygon,
  ceiling,
  materialId,
}: Props) {
  const isPoly = !!polygon && polygon.length >= 3
  const geometry = useMemo(
    () => (isPoly ? worldUvShapeGeometry(polygon!) : worldUvPlaneGeometry(width, depth)),
    [isPoly, polygon, width, depth],
  )
  // Geometry passed via `geometry=` isn't R3F-owned: dispose on change/unmount.
  // (No-op when the designed-ceiling path below replaces the flat plane — the
  // memo's geometry simply goes unused and is freed on the next change/unmount.)
  useDisposeGeometry(geometry)
  // A designed ceiling (tray/coffered/dropped) replaces the flat plane. The
  // per-room finish does not apply to a designed treatment yet (it keeps the
  // plain matte planes) — flat ceilings (every room by default) carry it.
  if (ceiling && ceiling.style !== 'flat' && isFeatureEnabled('ceilingDesign')) {
    const poly: [number, number][] = isPoly
      ? polygon!
      : [
          [origin[0], origin[1]],
          [origin[0] + width, origin[1]],
          [origin[0] + width, origin[1] + depth],
          [origin[0], origin[1] + depth],
        ]
    return <RoomCeiling polygon={poly} height={height} config={ceiling} />
  }
  // Polygon verts are absolute world metres (no offset); a rect centres on its
  // origin. Both share the floor's [-π/2] tilt so the back face points down.
  const position: [number, number, number] = isPoly
    ? [0, height, 0]
    : [origin[0] + width / 2, height, origin[1] + depth / 2]
  // A per-room finish (colour / texture) renders through the catalog material
  // dispatch; otherwise the plain white back-side ceiling.
  if (materialId && isFeatureEnabled('ceilingFinish')) {
    return (
      <SilentErrorBoundary resetKey={materialId}>
        <Suspense fallback={null}>
          <FinishedInner
            materialId={materialId as MaterialId}
            position={position}
            geometry={geometry}
          />
        </Suspense>
      </SilentErrorBoundary>
    )
  }
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      material={CEILING_MATERIAL}
      geometry={geometry}
    />
  )
}
