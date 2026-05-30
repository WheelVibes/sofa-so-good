import { Suspense } from 'react';
import type { MeshStandardMaterial } from 'three';
import {
  useMaterialDef,
  useProceduralMaterial,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial';
import { worldUvPlaneGeometry } from '../../materials/worldUv';
import type {
  MaterialId,
  ProceduralMaterialDef,
  SolidMaterialDef,
  TexturedMaterialDef,
} from '../../materials/types';

/**
 * A floor plane for a user-authored plan room, finished with any catalog
 * floor material. Mirrors RoomFloor's material dispatch but without the
 * RoomId-keyed finishes selection (custom rooms aren't in the finishes slice).
 */
interface Rect {
  origin: [number, number];
  width: number;
  depth: number;
}
type Props = Rect & { materialId: MaterialId };

function FloorMesh({ origin, width, depth, material }: Rect & { material: MeshStandardMaterial }) {
  const geometry = worldUvPlaneGeometry(width, depth);
  return (
    <mesh
      position={[origin[0] + width / 2, 0.006, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      material={material}
      geometry={geometry}
    />
  );
}

function Solid({ def, ...rest }: Rect & { def: SolidMaterialDef }) {
  return <FloorMesh {...rest} material={useSolidMaterial(def)} />;
}
function Textured({ def, ...rest }: Rect & { def: TexturedMaterialDef }) {
  return <FloorMesh {...rest} material={useTexturedMaterial(def)} />;
}
function Procedural({ def, ...rest }: Rect & { def: ProceduralMaterialDef }) {
  return <FloorMesh {...rest} material={useProceduralMaterial(def)} />;
}

function Inner({ materialId, ...rest }: Props) {
  const def = useMaterialDef(materialId);
  if (def.kind === 'textured') return <Textured def={def} {...rest} />;
  if (def.kind === 'procedural') return <Procedural def={def} {...rest} />;
  return <Solid def={def} {...rest} />;
}

export function PlanRoomFloor(props: Props) {
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
