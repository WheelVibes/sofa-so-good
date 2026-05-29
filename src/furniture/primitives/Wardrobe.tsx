import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface WardrobeProps {
  props: ParamProps;
}

/**
 * Wardrobe primitive: tall cabinet body + N inset door panels along the
 * front face. Doors are decorative (no animation) — the spec leaves
 * cabinet doors out of the door system, which only covers room doors.
 */
export function Wardrobe({ props }: WardrobeProps) {
  const width = readNum(props, 'width', 1.5);
  const doorCount = Math.max(2, Math.min(4, Math.round(readNum(props, 'doorCount', 3))));
  const color = readStr(props, 'color', '#caa478');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const doorStyle = readStr(props, 'doorStyle', 'hinged');

  const depth = 0.6;
  const height = 2.1;
  const doorInset = 0.02;
  const doorGap = 0.01;
  const doorPanelH = height - 0.1;
  const doorPanelW = (width - doorGap * (doorCount + 1) - 0.02) / doorCount;

  const wood = getSurfaceMaterial(finish, color, 2, sheen);
  const frameMetal = { color: '#b8bcc0', roughness: 0.35, metalness: 0.75 } as const;

  // Sliding-door wardrobe (the HDB norm): two/three large aluminium-framed
  // laminate panels that overlap slightly on a track, with edge pulls — no
  // protruding knobs. Panels sit at two slightly different depths so they read
  // as bypassing on separate tracks.
  const sliding = doorStyle === 'sliding';
  const slidePanels = (() => {
    if (!sliding) return null;
    const n = Math.max(2, Math.min(3, doorCount >= 3 ? 3 : 2));
    const overlap = 0.04;
    const panelW = (width + overlap * (n - 1)) / n;
    const panelH = height - 0.06;
    return Array.from({ length: n }, (_, i) => {
      const x = -width / 2 + panelW / 2 + i * (panelW - overlap);
      const z = depth / 2 - (i % 2) * 0.03; // alternate track depth
      return (
        <group key={i}>
          {/* Aluminium frame */}
          <mesh castShadow position={[x, height / 2, z]}>
            <boxGeometry args={[panelW, panelH, 0.03]} />
            <meshStandardMaterial {...frameMetal} />
          </mesh>
          {/* Laminate insert */}
          <mesh castShadow position={[x, height / 2, z + 0.016]} material={wood}>
            <boxGeometry args={[panelW - 0.05, panelH - 0.05, 0.01]} />
          </mesh>
          {/* Recessed edge pull (vertical channel on the leading edge) */}
          <mesh position={[x + panelW / 2 - 0.03, height / 2, z + 0.02]}>
            <boxGeometry args={[0.015, panelH - 0.2, 0.01]} />
            <meshStandardMaterial color="#5a5e63" roughness={0.4} metalness={0.6} />
          </mesh>
        </group>
      );
    });
  })();

  const doors = sliding
    ? null
    : Array.from({ length: doorCount }, (_, i) => {
    const x = -width / 2 + doorGap + doorPanelW / 2 + i * (doorPanelW + doorGap);
    // Handle on the inner edge of each door (toward the centre gap).
    const handleSide = i < doorCount / 2 ? 1 : -1;
    const handleX = x + handleSide * (doorPanelW / 2 - 0.05);
    return (
      <group key={i}>
        <mesh castShadow position={[x, height / 2, depth / 2 - doorInset]} material={wood}>
          <boxGeometry args={[doorPanelW, doorPanelH, 0.015]} />
        </mesh>
        <mesh castShadow position={[handleX, height / 2, depth / 2 + 0.012]}>
          <boxGeometry args={[0.02, 0.22, 0.02]} />
          <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
        </mesh>
      </group>
    );
  });

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={wood}>
        <boxGeometry args={[width, height, depth]} />
      </mesh>
      {doors}
      {slidePanels}
    </group>
  );
}
