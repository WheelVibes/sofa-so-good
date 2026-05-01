import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface BookshelfProps {
  props: ParamProps;
}

/**
 * Bookshelf primitive: back panel + two side panels + N evenly-spaced
 * horizontal shelves. The opening faces +Z.
 */
export function Bookshelf({ props }: BookshelfProps) {
  const width = readNum(props, 'width', 0.9);
  const height = readNum(props, 'height', 1.8);
  const shelfCount = Math.max(2, Math.min(6, Math.round(readNum(props, 'shelfCount', 4))));
  const color = readStr(props, 'color', '#7a5e3a');

  const depth = 0.3;
  const sideThickness = 0.025;
  const backThickness = 0.012;
  const shelfThickness = 0.022;

  const innerH = height - shelfThickness;
  const shelfSpacing = innerH / (shelfCount - 1);
  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    const y = shelfThickness / 2 + i * shelfSpacing;
    return (
      <mesh key={i} castShadow receiveShadow position={[0, y, 0]}>
        <boxGeometry args={[width - sideThickness * 2, shelfThickness, depth - backThickness]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
    );
  });

  return (
    <group>
      {/* Sides */}
      <mesh castShadow receiveShadow position={[-width / 2 + sideThickness / 2, height / 2, 0]}>
        <boxGeometry args={[sideThickness, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      <mesh castShadow receiveShadow position={[width / 2 - sideThickness / 2, height / 2, 0]}>
        <boxGeometry args={[sideThickness, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Back */}
      <mesh castShadow receiveShadow position={[0, height / 2, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[width - sideThickness * 2, height, backThickness]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {shelves}
    </group>
  );
}
