import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface SofaProps {
  props: ParamProps;
}

/**
 * Sofa primitive: base + back + two arms + N evenly-spaced cushions.
 * Faces +Z (a person seated on it looks toward +Z).
 */
export function Sofa({ props }: SofaProps) {
  const width = readNum(props, 'width', 2.1);
  const depth = readNum(props, 'depth', 0.9);
  const cushionCount = Math.max(1, Math.floor(readNum(props, 'cushionCount', 3)));
  const color = readStr(props, 'color', '#8aa1a8');

  const seatH = 0.42;
  const baseH = 0.18;
  const backH = 0.45;
  const armW = 0.12;
  const cushionH = 0.16;

  const innerW = width - armW * 2;
  const cushionGap = 0.02;
  const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
  const cushionD = depth - 0.18;

  const cushions = Array.from({ length: cushionCount }, (_, i) => {
    const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
    return (
      <mesh key={i} castShadow position={[x, seatH + cushionH / 2, 0.04]}>
        <boxGeometry args={[cushionW, cushionH, cushionD]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0} />
      </mesh>
    );
  });

  return (
    <group>
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, baseH / 2, 0]}>
        <boxGeometry args={[width, baseH, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Seat platform */}
      <mesh castShadow position={[0, seatH, 0]}>
        <boxGeometry args={[innerW, 0.04, depth - 0.1]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Back */}
      <mesh castShadow position={[0, seatH + backH / 2, -depth / 2 + 0.08]}>
        <boxGeometry args={[width, backH, 0.16]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Arms */}
      <mesh castShadow position={[-(width - armW) / 2, (seatH + backH * 0.5) / 2 + 0.05, 0]}>
        <boxGeometry args={[armW, seatH + backH * 0.5, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      <mesh castShadow position={[(width - armW) / 2, (seatH + backH * 0.5) / 2 + 0.05, 0]}>
        <boxGeometry args={[armW, seatH + backH * 0.5, depth]} />
        <meshStandardMaterial color={color} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {cushions}
    </group>
  );
}
