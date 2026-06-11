import { Suspense, useEffect, useMemo } from 'react'
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
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'

interface FaceProps {
  /** Wall-face width/height in metres (the plane is built with world UVs so
   *  tiling finishes keep a consistent physical scale). */
  width: number
  height: number
  /** Local position inside the parent (already-rotated) wall group. */
  position: [number, number, number]
  /** Y rotation inside the parent group (0 = local +Z face, π = −Z face). */
  yRot: number
}

function FaceMesh({ material, ...rest }: FaceProps & { material: MeshStandardMaterial }) {
  const geometry = useMemo(
    () => worldUvPlaneGeometry(rest.width, rest.height),
    [rest.width, rest.height],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  // Clone the shared cached finish material so the depth-bias below never
  // leaks onto floors using the same material; polygonOffset keeps the face
  // from z-fighting the plaster box at zoomed-out distances (see WallSegment).
  const biased = useMemo(() => {
    const m = material.clone()
    m.polygonOffset = true
    m.polygonOffsetFactor = -1
    m.polygonOffsetUnits = -1
    return m
  }, [material])
  useEffect(() => () => biased.dispose(), [biased])
  return (
    <mesh
      position={rest.position}
      rotation={[0, rest.yRot, 0]}
      material={biased}
      geometry={geometry}
      receiveShadow
    />
  )
}

function SolidFace({ def, ...rest }: FaceProps & { def: SolidMaterialDef }) {
  return <FaceMesh {...rest} material={useSolidMaterial(def)} />
}
function TexturedFace({ def, ...rest }: FaceProps & { def: TexturedMaterialDef }) {
  return <FaceMesh {...rest} material={useTexturedMaterial(def)} />
}
function ProceduralFace({ def, ...rest }: FaceProps & { def: ProceduralMaterialDef }) {
  return <FaceMesh {...rest} material={useProceduralMaterial(def)} />
}

function Dispatch({ materialId, ...rest }: FaceProps & { materialId: MaterialId }) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <TexturedFace def={def} {...rest} />
  if (def.kind === 'procedural') return <ProceduralFace def={def} {...rest} />
  return <SolidFace def={def} {...rest} />
}

/**
 * The room-facing finish plane of a custom-plan wall — the per-room-editor
 * analogue of `WallSegment`'s interior `FacePlane`, dispatching any catalog
 * wall material (solid / procedural / textured, incl. `#hex` custom colours)
 * over the plain plaster wall body. Suspense + error-boundary wrapped so a
 * still-loading or failed texture falls back to the plaster underneath.
 */
export function PlanWallFinishFace(props: FaceProps & { materialId: MaterialId }) {
  return (
    <SilentErrorBoundary>
      <Suspense fallback={null}>
        <Dispatch {...props} />
      </Suspense>
    </SilentErrorBoundary>
  )
}
