import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
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

  const doors = Array.from({ length: doorCount }, (_, i) => {
    const x = -width / 2 + doorGap + doorPanelW / 2 + i * (doorPanelW + doorGap);
    return (
      <mesh key={i} castShadow receiveShadow position={[x, height / 2, depth / 2 - doorInset]}>
        <boxGeometry args={[doorPanelW, doorPanelH, 0.015]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
        {/* Handle as a child sphere */}
      </mesh>
    );
  });

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {doors}
    </group>
  );
}
