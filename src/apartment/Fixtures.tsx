import { ROOMS } from './constants';
import type { RoomId } from './types';

interface FixturePlacement {
  /** Position relative to the room's NW corner. */
  offset: [number, number];
  size: [number, number, number]; // x, y, z (metres)
  color: string;
}

const FIXTURES: Partial<Record<RoomId, FixturePlacement[]>> = {
  bath1: [
    { offset: [0.2, 0.2], size: [0.5, 0.45, 0.7], color: '#fafafa' }, // toilet
    { offset: [0.2, 1.0], size: [0.5, 0.85, 0.45], color: '#fafafa' }, // sink + counter
    { offset: [0.5, 1.5], size: [0.9, 0.05, 0.5], color: '#dfe3e6' }, // shower tray
  ],
  bath2: [
    { offset: [0.2, 0.2], size: [0.5, 0.45, 0.7], color: '#fafafa' },
    { offset: [0.2, 1.0], size: [0.5, 0.85, 0.45], color: '#fafafa' },
    { offset: [0.5, 1.3], size: [0.8, 0.05, 0.4], color: '#dfe3e6' },
  ],
};

export function Fixtures() {
  return (
    <group>
      {Object.entries(FIXTURES).flatMap(([roomId, placements]) => {
        const r = ROOMS[roomId as RoomId];
        return (placements ?? []).map((p, i) => {
          const x = r.origin[0] + p.offset[0] + p.size[0] / 2;
          const z = r.origin[1] + p.offset[1] + p.size[2] / 2;
          const y = p.size[1] / 2;
          return (
            <mesh key={`${roomId}-${i}`} position={[x, y, z]} castShadow receiveShadow>
              <boxGeometry args={p.size} />
              <meshStandardMaterial color={p.color} roughness={0.5} />
            </mesh>
          );
        });
      })}
    </group>
  );
}
