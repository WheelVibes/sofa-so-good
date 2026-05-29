import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
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

  const depth = 0.6;
  const height = 2.1;
  const doorInset = 0.02;
  const doorGap = 0.01;
  const doorPanelH = height - 0.1;
  const doorPanelW = (width - doorGap * (doorCount + 1) - 0.02) / doorCount;

  const wood = getWoodMaterial(color, 2);
  const doors = Array.from({ length: doorCount }, (_, i) => {
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
    </group>
  );
}
