import { Suspense, memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FLAT } from '../constants';
import { buildWallSegments, wallThicknessMetres } from '../wallSegments';
import { useStore } from '../../state/store';
import { useMaterial } from '../../materials/useMaterial';
import type { WallSpec, RoomId } from '../types';
import type { MaterialId } from '../../materials/types';
import { wallRoomSides } from './wallRoomSides';

const FACE_OFFSET = 0.001; // lift face plane fractionally off the body box

interface WallFacesProps {
  segments: ReturnType<typeof buildWallSegments>;
  length: number;
  thickness: number;
  /** +1 = +Z face, -1 = -Z face in the wall's local frame. */
  sign: 1 | -1;
  materialId: MaterialId;
}

function WallFacesInner({ segments, length, thickness, sign, materialId }: WallFacesProps) {
  const { material } = useMaterial(materialId);
  return (
    <group>
      {segments.map((s, i) => {
        const segLen = s.end - s.start;
        const segMid = (s.start + s.end) / 2 - length / 2;
        const segHeight = s.top - s.bottom;
        const segMidY = s.bottom + segHeight / 2;
        const z = sign * (thickness / 2 + FACE_OFFSET);
        // Plane default normal +Z; rotate 180° around Y to flip for -Z faces.
        const yRot = sign === 1 ? 0 : Math.PI;
        return (
          <mesh
            key={i}
            position={[segMid, segMidY, z]}
            rotation={[0, yRot, 0]}
            material={material}
          >
            <planeGeometry args={[segLen, segHeight]} />
          </mesh>
        );
      })}
    </group>
  );
}

const WallFaces = memo(WallFacesInner);

interface WallSegmentProps {
  wall: WallSpec;
}

/** Renders one wall as: a generic body box (structural concrete look)
 *  plus up to two interior face planes, each painted with the adjacent
 *  room's wall finish. External faces (no adjacent interior room) skip
 *  rendering — the apartment's outside is not visible from the camera. */
function WallSegmentInner({ wall }: WallSegmentProps) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const thickness = wallThicknessMetres(wall);
  const segments = buildWallSegments(wall, FLAT.ceilingHeight);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  const sides = wallRoomSides(wall);
  // Subscribe selectively so a finish change in one room re-renders only
  // walls touching that room.
  const positiveMat = useStore(
    useShallow((s) => (sides.positive ? s.finishes.walls[sides.positive as RoomId] : null)),
  );
  const negativeMat = useStore(
    useShallow((s) => (sides.negative ? s.finishes.walls[sides.negative as RoomId] : null)),
  );

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {/* Body — neutral concrete-ish material. Wall finishes paint the
          interior face planes on top. */}
      {segments.map((s, i) => {
        const segLen = s.end - s.start;
        const segMid = (s.start + s.end) / 2 - length / 2;
        const segHeight = s.top - s.bottom;
        const segMidY = s.bottom + segHeight / 2;
        return (
          <mesh key={i} position={[segMid, segMidY, 0]} castShadow receiveShadow>
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial color="#dcd8d2" roughness={0.95} />
          </mesh>
        );
      })}
      {positiveMat ? (
        <Suspense fallback={null}>
          <WallFaces
            segments={segments}
            length={length}
            thickness={thickness}
            sign={1}
            materialId={positiveMat}
          />
        </Suspense>
      ) : null}
      {negativeMat ? (
        <Suspense fallback={null}>
          <WallFaces
            segments={segments}
            length={length}
            thickness={thickness}
            sign={-1}
            materialId={negativeMat}
          />
        </Suspense>
      ) : null}
    </group>
  );
}

export const WallSegment = memo(WallSegmentInner, (a, b) => a.wall === b.wall);
