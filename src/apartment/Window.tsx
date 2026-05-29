import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { WALLS, WINDOWS } from './constants';
import { getWallOpacity } from './walls/wallReveal';
import type { WindowSpec, WallSpec } from './types';

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId);
}

const FRAME_T = 0.05; // frame bar thickness
const FRAME_D = 0.08; // frame depth (across the wall)
const GLASS_D = 0.02;

const frameMat = { color: '#e6e7e4', roughness: 0.45, metalness: 0.35 } as const;

function Bar({
  w,
  h,
  x,
  y,
}: {
  w: number;
  h: number;
  x: number;
  y: number;
}) {
  return (
    <mesh position={[x, y, 0]} castShadow>
      <boxGeometry args={[w, h, FRAME_D]} />
      <meshStandardMaterial {...frameMat} />
    </mesh>
  );
}

const GRILLE_T = 0.012; // bar thickness
const GRILLE_Z = 0.05; // interior offset, in front of the glass
const GRILLE_SPACING = 0.12; // gap between vertical bars
const grilleMat = { color: '#d9dadc', roughness: 0.45, metalness: 0.5 } as const;

/** Slim vertical bar grille with a single horizontal rail, sized to the
 *  glazed opening. Bars sit just inside the glass so they read from the room
 *  and through the window from outside. */
function Grille({ w, h }: { w: number; h: number }) {
  const count = Math.max(2, Math.round(w / GRILLE_SPACING));
  const step = w / (count + 1);
  const bars: number[] = [];
  for (let i = 1; i <= count; i++) bars.push(-w / 2 + i * step);
  return (
    <group position={[0, 0, GRILLE_Z]}>
      {bars.map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <boxGeometry args={[GRILLE_T, h, GRILLE_T]} />
          <meshStandardMaterial {...grilleMat} />
        </mesh>
      ))}
      {/* horizontal rail at mid-height */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w, GRILLE_T, GRILLE_T]} />
        <meshStandardMaterial {...grilleMat} />
      </mesh>
    </group>
  );
}

function WindowPane({ spec }: { spec: WindowSpec }) {
  const wall = findWall(spec.wallId);
  const groupRef = useRef<Group>(null);
  // Hide the window once its host wall has faded most of the way out, so it
  // doesn't float in mid-air during the dollhouse reveal.
  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = getWallOpacity(spec.wallId) > 0.35;
  });
  if (!wall) return null;
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (wall.start[0] + wall.end[0]) / 2;
  const midZ = (wall.start[1] + wall.end[1]) / 2;
  const localX = spec.offset + spec.width / 2 - length / 2;
  const h = spec.head - spec.sill;
  const w = spec.width;
  const cy = spec.sill + h / 2;

  // Mullions: wide windows get a vertical divider (sliding-window style),
  // tall ones a horizontal transom.
  const verticalMullion = w > 1.2;
  const horizontalMullion = h > 1.5;

  return (
    <group ref={groupRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group position={[localX, cy, 0]}>
        {/* Glass */}
        <mesh>
          <boxGeometry args={[w - FRAME_T, h - FRAME_T, GLASS_D]} />
          <meshStandardMaterial
            color="#bcd4e6"
            roughness={0.05}
            metalness={0.1}
            transparent
            opacity={0.28}
          />
        </mesh>
        {/* Outer frame */}
        <Bar w={w} h={FRAME_T} x={0} y={h / 2 - FRAME_T / 2} />
        <Bar w={w} h={FRAME_T} x={0} y={-h / 2 + FRAME_T / 2} />
        <Bar w={FRAME_T} h={h} x={-w / 2 + FRAME_T / 2} y={0} />
        <Bar w={FRAME_T} h={h} x={w / 2 - FRAME_T / 2} y={0} />
        {/* Mullions */}
        {verticalMullion && <Bar w={FRAME_T * 0.8} h={h} x={0} y={0} />}
        {horizontalMullion && <Bar w={w} h={FRAME_T * 0.8} x={0} y={0} />}
        {/* Safety grille — slim vertical bars on the interior side, a
            near-universal HDB window feature. */}
        <Grille w={w - FRAME_T} h={h - FRAME_T} />
      </group>
      {/* Interior sill ledge */}
      <mesh position={[localX, spec.sill - 0.02, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.1, 0.04, 0.16]} />
        <meshStandardMaterial color="#eceae4" roughness={0.7} />
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
