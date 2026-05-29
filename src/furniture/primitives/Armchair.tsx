import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Upholstered armchair: base + seat cushion + back cushion + two arms,
 *  all softly rounded. Faces +Z. */
export function Armchair({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.85);
  const depth = readNum(props, 'depth', 0.85);
  const color = readStr(props, 'color', '#b06a52');

  const baseH = 0.22;
  const seatH = 0.42;
  const backH = 0.5;
  const armW = 0.14;
  const cushionH = 0.16;
  const innerW = width - armW * 2;

  const mat = getFabricMaterial(color);

  return (
    <group>
      {/* Base */}
      <RoundedBox args={[width, baseH, depth]} radius={0.05} smoothness={2} castShadow receiveShadow position={[0, baseH / 2, 0]} material={mat} />
      {/* Seat cushion */}
      <RoundedBox args={[innerW, cushionH, depth - 0.18]} radius={0.05} smoothness={2} castShadow position={[0, seatH + cushionH / 2, 0.03]} material={mat} />
      {/* Back cushion */}
      <RoundedBox args={[innerW, backH, 0.18]} radius={0.05} smoothness={2} castShadow position={[0, seatH + backH / 2, -depth / 2 + 0.1]} material={mat} />
      {/* Arms */}
      {[-1, 1].map((s) => (
        <RoundedBox key={s} args={[armW, seatH * 0.9 + cushionH, depth]} radius={0.05} smoothness={2} castShadow position={[s * (width - armW) / 2, seatH * 0.75, 0]} material={mat} />
      ))}
      {/* Feet */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}.${sz}`} castShadow position={[sx * (width / 2 - 0.08), 0.03, sz * (depth / 2 - 0.08)]}>
            <cylinderGeometry args={[0.025, 0.025, 0.06, 8]} />
            <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.2} />
          </mesh>
        )),
      )}
    </group>
  );
}
