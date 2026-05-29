import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface SofaProps {
  props: ParamProps;
}

/**
 * Sofa primitive: base + back + two arms + N evenly-spaced cushions, all
 * with softly rounded edges so the upholstery reads as cushioned fabric.
 * Faces +Z (a person seated on it looks toward +Z).
 */
export function Sofa({ props }: SofaProps) {
  const width = readNum(props, 'width', 2.1);
  const depth = readNum(props, 'depth', 0.9);
  const cushionCount = Math.max(1, Math.floor(readNum(props, 'cushionCount', 3)));
  const color = readStr(props, 'color', '#8aa1a8');

  const seatH = 0.42;
  const baseH = 0.2;
  const backH = 0.5;
  const armW = 0.16;
  const cushionH = 0.18;

  const innerW = width - armW * 2;
  const cushionGap = 0.03;
  const cushionW = (innerW - cushionGap * (cushionCount - 1)) / cushionCount;
  const cushionD = depth - 0.2;

  const mat = getFabricMaterial(color);
  const r = 0.05;

  return (
    <group>
      {/* Base */}
      <RoundedBox args={[width, baseH, depth]} radius={r} smoothness={2} castShadow receiveShadow position={[0, baseH / 2, 0]} material={mat} />
      {/* Back */}
      <RoundedBox args={[innerW, backH, 0.18]} radius={0.05} smoothness={2} castShadow position={[0, baseH + backH / 2, -depth / 2 + 0.11]} material={mat} />
      {/* Arms */}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={s}
          args={[armW, seatH + backH * 0.6, depth]}
          radius={0.06}
          smoothness={2}
          castShadow
          position={[s * (width - armW) / 2, (seatH + backH * 0.6) / 2, 0]}
          material={mat}
        />
      ))}
      {/* Seat cushions */}
      {Array.from({ length: cushionCount }, (_, i) => {
        const x = -innerW / 2 + cushionW / 2 + i * (cushionW + cushionGap);
        return (
          <RoundedBox
            key={i}
            args={[cushionW, cushionH, cushionD]}
            radius={0.05}
            smoothness={2}
            castShadow
            position={[x, baseH + cushionH / 2, 0.05]}
            material={mat}
          />
        );
      })}
      {/* Feet */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}.${sz}`} position={[sx * (width / 2 - 0.1), 0.03, sz * (depth / 2 - 0.1)]} castShadow>
            <cylinderGeometry args={[0.03, 0.025, 0.06, 10]} />
            <meshStandardMaterial color="#2c2620" roughness={0.4} metalness={0.3} />
          </mesh>
        )),
      )}
    </group>
  );
}
