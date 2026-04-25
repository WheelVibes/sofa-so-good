import { DOORS, FLAT, WALLS } from './constants';
import type { DoorSpec, WallSpec } from './types';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId);
}

function DoorLeaf({ spec }: { spec: DoorSpec }) {
  const wall = findWall(spec.wallId);
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  const hingeLocalX =
    spec.hinge === 'start'
      ? spec.offset - length / 2
      : spec.offset + spec.width - length / 2;

  const swingSign = spec.swing === 'left' ? 1 : -1;
  const angleY = 0;
  const direction = spec.hinge === 'start' ? 1 : -1;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group position={[hingeLocalX, 0, 0]} rotation={[0, swingSign * angleY, 0]}>
        <mesh position={[(direction * spec.width) / 2, FLAT.doorHeight / 2, 0]} castShadow>
          <boxGeometry args={[spec.width, FLAT.doorHeight, 0.04]} />
          <meshStandardMaterial color="#9d7c54" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}

export function Doors() {
  return (
    <group>
      {DOORS.map((d) => (
        <DoorLeaf key={d.id} spec={d} />
      ))}
    </group>
  );
}
