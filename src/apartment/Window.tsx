import { WALLS, WINDOWS } from './constants';
import type { WindowSpec, WallSpec } from './types';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId);
}

function WindowPane({ spec }: { spec: WindowSpec }) {
  const wall = findWall(spec.wallId);
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const localX = spec.offset + spec.width / 2 - length / 2;
  const paneHeight = spec.head - spec.sill;
  const paneCenterY = spec.sill + paneHeight / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <mesh position={[localX, paneCenterY, 0]}>
        <boxGeometry args={[spec.width, paneHeight, 0.04]} />
        <meshStandardMaterial
          color="#cfe1ec"
          roughness={0.1}
          metalness={0}
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
}

export function Windows() {
  return (
    <group>
      {WINDOWS.map((w) => (
        <WindowPane key={w.id} spec={w} />
      ))}
    </group>
  );
}
