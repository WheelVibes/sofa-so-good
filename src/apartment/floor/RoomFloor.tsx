import { Suspense, memo, useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useMaterial } from '../../materials/useMaterial';
import { useStore } from '../../state/store';
import type { RoomId } from '../types';
import type { MaterialId } from '../../materials/types';

const FLOOR_LIFT = 0.001;

interface RoomFloorProps {
  roomId: RoomId;
  origin: [number, number];
  width: number;
  depth: number;
  materialId: MaterialId;
}

function RoomFloorInner({ roomId, origin, width, depth, materialId }: RoomFloorProps) {
  const { material } = useMaterial(materialId);
  const selectRoom = useStore((s) => s.selectRoom);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
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
