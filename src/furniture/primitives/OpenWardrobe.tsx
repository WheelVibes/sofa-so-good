import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface OpenWardrobeProps {
  props: ParamProps;
}

/**
 * OpenWardrobe primitive: walk-in-style cabinet — two side panels + back +
 * N internal shelves, plus an optional horizontal hanging rod. No doors,
 * no front. The opening faces +Z.
 */
export function OpenWardrobe({ props }: OpenWardrobeProps) {
  const width = readNum(props, 'width', 1.6);
  const depth = readNum(props, 'depth', 0.6);
  const height = readNum(props, 'height', 2.1);
  const shelfCount = Math.max(2, Math.min(5, Math.round(readNum(props, 'shelfCount', 3))));
  const hasRod = readStr(props, 'hasRod', 'yes') === 'yes';
  const color = readStr(props, 'color', '#caa478');

  const sideThickness = 0.03;
  const backThickness = 0.015;
  const shelfThickness = 0.025;
  const innerW = width - sideThickness * 2;

  // N shelves spaced evenly between floor and top (inclusive).
  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    const y = (i / (shelfCount - 1)) * (height - shelfThickness) + shelfThickness / 2;
    return (
      <mesh key={i} castShadow receiveShadow position={[0, y, 0]}>
        <boxGeometry args={[innerW, shelfThickness, depth - backThickness]} />
        <meshStandardMaterial
          color={color}
          roughness={STYLISED_ROUGHNESS}
          metalness={STYLISED_METALNESS}
        />
      </mesh>
    );
  });

  return (
    <group>
      {/* Sides */}
      <mesh castShadow position={[-width / 2 + sideThickness / 2, height / 2, 0]}>
        <boxGeometry args={[sideThickness, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      <mesh castShadow position={[width / 2 - sideThickness / 2, height / 2, 0]}>
        <boxGeometry args={[sideThickness, height, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Back */}
      <mesh receiveShadow position={[0, height / 2, -depth / 2 + backThickness / 2]}>
        <boxGeometry args={[innerW, height, backThickness]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {shelves}
      {hasRod ? (
        <mesh castShadow position={[0, height * 0.7, 0]}>
          <boxGeometry args={[innerW, 0.03, 0.03]} />
          <meshStandardMaterial color="#9a9a9a" roughness={0.5} metalness={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}
