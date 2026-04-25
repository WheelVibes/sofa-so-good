import { FLAT, WALLS } from './constants';
import { buildWallSegments, wallThicknessMetres } from './wallSegments';
import type { WallSpec } from './types';

function WallRender({ wall }: { wall: WallSpec }) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const thickness = wallThicknessMetres(wall);
  const segments = buildWallSegments(wall, FLAT.ceilingHeight);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;

  return (
    <group position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      {segments.map((s, i) => {
        const segLen = s.end - s.start;
        const segMid = (s.start + s.end) / 2 - length / 2;
        const segHeight = s.top - s.bottom;
        const segMidY = s.bottom + segHeight / 2;
        return (
          <mesh key={i} position={[segMid, segMidY, 0]} castShadow receiveShadow>
            <boxGeometry args={[segLen, segHeight, thickness]} />
            <meshStandardMaterial color="#ffffff" roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Walls() {
  return (
    <group>
      {WALLS.map((w) => (
        <WallRender key={w.id} wall={w} />
      ))}
    </group>
  );
}
