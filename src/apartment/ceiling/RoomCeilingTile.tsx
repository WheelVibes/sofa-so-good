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
import { worldUvPlaneGeometry } from '../../materials/worldUv'
import { useDisposeGeometry } from '../../scene/geometryUtil'
import { SilentErrorBoundary } from '../../scene/SilentErrorBoundary'

/**
 * A single finished ceiling tile for the fixed move-in flat (CUSTOMIZE-CEILING).
 * Mirrors {@link RoomFloor}'s material dispatch but renders the plane with the
 * `[+π/2]` tilt the default flat already uses for its white ceiling tiles, so a
 * (front-side) catalog material faces **down** — visible from below in walk
 * mode, culled from the orbit/dollhouse view above. The plain-white tile stays
 * inline in {@link Ceiling}; this is only used when a room has a ceiling finish.
 */
interface TileProps {
  cx: number
  cz: number
  y: number
  w: number
  d: number
}

function CeilingTileMesh({
  cx,
  cz,
  y,
  w,
  d,
  material,
}: TileProps & { material: MeshStandardMaterial }) {
  const geometry = useMemo(() => worldUvPlaneGeometry(w, d), [w, d])
  // Geometry passed via `geometry=` isn't R3F-owned: dispose on resize/unmount.
  useDisposeGeometry(geometry)
  return (
    <mesh
      position={[cx, y, cz]}
      rotation={[Math.PI / 2, 0, 0]}
      material={material}
      geometry={geometry}
    />
  )
}

function SolidTile({ def, ...rest }: TileProps & { def: SolidMaterialDef }) {
  return <CeilingTileMesh {...rest} material={useSolidMaterial(def)} />
}
function TexturedTile({ def, ...rest }: TileProps & { def: TexturedMaterialDef }) {
  return <CeilingTileMesh {...rest} material={useTexturedMaterial(def)} />
}
function ProceduralTile({ def, ...rest }: TileProps & { def: ProceduralMaterialDef }) {
  return <CeilingTileMesh {...rest} material={useProceduralMaterial(def)} />
}

function Inner({ materialId, ...rest }: TileProps & { materialId: MaterialId }) {
  const def = useMaterialDef(materialId)
  if (def.kind === 'textured') return <TexturedTile def={def} {...rest} />
  if (def.kind === 'procedural') return <ProceduralTile def={def} {...rest} />
  return <SolidTile def={def} {...rest} />
}

export function RoomCeilingTile({ materialId, ...rest }: TileProps & { materialId: MaterialId }) {
  return (
    <SilentErrorBoundary resetKey={materialId}>
      <Suspense fallback={null}>
        <Inner materialId={materialId} {...rest} />
      </Suspense>
    </SilentErrorBoundary>
  )
}
