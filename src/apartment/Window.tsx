import { DoubleSide } from 'three';
import { WALLS, WINDOWS } from './constants';
import type { WindowSpec, WallSpec } from './types';
import { useStore } from '../state/store';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId);
}

function WindowPane({ spec }: { spec: WindowSpec }) {
  const wall = findWall(spec.wallId);
  const curtainsClosed = useStore((s) => s.curtainsClosed);
  const curtainOpacity = useStore((s) => s.curtainOpacity);
  const shadowsOn = useStore((s) => s.quality.shadows !== 'off');
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
      {curtainsClosed && (
        <mesh
          position={[localX, paneCenterY, 0.03]}
          castShadow={shadowsOn}
          receiveShadow
        >
          <planeGeometry args={[spec.width, paneHeight]} />
          <meshStandardMaterial
            color="#dccaa6"
            roughness={0.85}
            metalness={0}
            transparent={curtainOpacity < 1}
            opacity={curtainOpacity}
            side={DoubleSide}
          />
        </mesh>
      )}
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
