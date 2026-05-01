import { Suspense, memo, useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import {
  useMaterialDef,
  useSolidMaterial,
  useTexturedMaterial,
} from '../../materials/useMaterial';
import { useStore } from '../../state/store';
import type { RoomId } from '../types';
import type { MaterialId, SolidMaterialDef, TexturedMaterialDef } from '../../materials/types';

const FLOOR_LIFT = 0.001;

interface RoomFloorProps {
  roomId: RoomId;
  origin: [number, number];
  width: number;
  depth: number;
  materialId: MaterialId;
}

interface FloorMeshProps {
  roomId: RoomId;
  origin: [number, number];
  width: number;
  depth: number;
  material: MeshStandardMaterial;
}

function FloorMesh({ roomId, origin, width, depth, material }: FloorMeshProps) {
  const selectRoom = useStore((s) => s.selectRoom);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const state = useStore.getState();
      // Walk mode and rotate-tool are view-only — don't open finishes.
      if (state.cameraMode !== 'orbit') return;
      if (state.editorTool !== 'select') return;
      e.stopPropagation();
      selectRoom(roomId);
    },
    [roomId, selectRoom],
  );
  return (
    <mesh
      position={[origin[0] + width / 2, FLOOR_LIFT, origin[1] + depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={onClick}
      material={material}
    >
      <planeGeometry args={[width, depth]} />
    </mesh>
  );
}

function SolidRoomFloor({ def, ...rest }: Omit<FloorMeshProps, 'material'> & { def: SolidMaterialDef }) {
  const material = useSolidMaterial(def);
  return <FloorMesh {...rest} material={material} />;
}

function TexturedRoomFloor({
  def,
  ...rest
}: Omit<FloorMeshProps, 'material'> & { def: TexturedMaterialDef }) {
  const material = useTexturedMaterial(def);
  return <FloorMesh {...rest} material={material} />;
}

function RoomFloorInner({ materialId, ...rest }: RoomFloorProps) {
  const def = useMaterialDef(materialId);
  return def.kind === 'textured' ? (
    <TexturedRoomFloor def={def} {...rest} />
  ) : (
    <SolidRoomFloor def={def} {...rest} />
  );
}

const RoomFloorMemo = memo(RoomFloorInner, (prev, next) => {
  return (
    prev.roomId === next.roomId &&
    prev.materialId === next.materialId &&
    prev.origin[0] === next.origin[0] &&
    prev.origin[1] === next.origin[1] &&
    prev.width === next.width &&
    prev.depth === next.depth
  );
});

/** Wraps the per-room floor mesh in a Suspense boundary so a slow
 *  texture load on one room doesn't block the others. */
export function RoomFloor(props: RoomFloorProps) {
  return (
    <Suspense fallback={null}>
      <RoomFloorMemo {...props} />
    </Suspense>
  );
}
