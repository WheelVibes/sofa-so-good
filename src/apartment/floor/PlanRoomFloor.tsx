import { Suspense, useMemo } from 'react'
import type { MeshStandardMaterial } from 'three'
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
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'

/**
 * A floor plane for a user-authored plan room, finished with any catalog
 * floor material. Mirrors RoomFloor's material dispatch but without the
 * RoomId-keyed finishes selection (custom rooms aren't in the finishes slice).
 * A `polygon` (world-metre `[x,z]` verts) renders a triangulated non-rectangular
 * floor; otherwise the origin/width/depth rectangle is used.
 */
interface Rect {
  origin: [number, number]
  width: number
  depth: number
  polygon?: [number, number][]
}
type Props = Rect & { materialId: MaterialId }

function FloorMesh({
  origin,
  width,
  depth,
  polygon,
  material,
}: Rect & { material: MeshStandardMaterial }) {
  if (polygon && polygon.length >= 3) {
    return <PolygonFloor polygon={polygon} material={material} />
  }
  const geometry = worldUvPlaneGeometry(width, depth)
  return (
    <mesh
      position={[origin[0] + width / 2, 0.006, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      material={material}
      geometry={geometry}
    />
  )
}

/** Triangulated absolute-coord floor for a non-rectangular room (verts are
 *  world metres, so no position offset). Geometry is memoised on the polygon. */
function PolygonFloor({
  polygon,
  material,
}: {
  polygon: [number, number][]
  material: MeshStandardMaterial
}) {
  const geometry = useMemo(() => worldUvShapeGeometry(polygon), [polygon])
  return (
    <mesh
      position={[0, 0.006, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      material={material}
      geometry={geometry}
    />
  )
}

function Solid({ def, ...rest }: Rect & { def: SolidMaterialDef }) {
  return <FloorMesh {...rest} material={useSolidMaterial(def)} />
}
function Textured({ def, ...rest }: Rect & { def: TexturedMaterialDef }) {
  return <FloorMesh {...rest} material={useTexturedMaterial(def)} />
}
function Procedural({ def, ...rest }: Rect & { def: ProceduralMaterialDef }) {
  return <FloorMesh {...rest} material={useProceduralMaterial(def)} />
}

function Inner({ materialId, ...rest }: Props) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <Textured def={def} {...rest} />
  if (def.kind === 'procedural') return <Procedural def={def} {...rest} />
  return <Solid def={def} {...rest} />
}

export function PlanRoomFloor(props: Props) {
  return (
    <SilentErrorBoundary resetKey={props.materialId}>
      <Suspense fallback={null}>
        <Inner {...props} />
      </Suspense>
    </SilentErrorBoundary>
  )
}
