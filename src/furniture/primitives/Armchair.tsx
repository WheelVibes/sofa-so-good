import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Upholstered armchair: base + seat cushion + back cushion + two arms.
 *  Faces +Z. */
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

  const fabric = { roughness: 0.92, metalness: 0 };

  return (
    <group>
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, baseH / 2, 0]}>
        <boxGeometry args={[width, baseH, depth]} />
        <meshStandardMaterial color={color} {...fabric} />
      </mesh>
      {/* Seat cushion */}
      <mesh castShadow position={[0, seatH + cushionH / 2, 0.03]}>
        <boxGeometry args={[innerW, cushionH, depth - 0.18]} />
        <meshStandardMaterial color={color} {...fabric} />
      </mesh>
      {/* Back cushion */}
      <mesh castShadow position={[0, seatH + backH / 2, -depth / 2 + 0.1]}>
        <boxGeometry args={[innerW, backH, 0.18]} />
        <meshStandardMaterial color={color} {...fabric} />
      </mesh>
      {/* Arms */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * (width - armW) / 2, seatH * 0.75, 0]}>
          <boxGeometry args={[armW, seatH * 0.9 + cushionH, depth]} />
          <meshStandardMaterial color={color} {...fabric} />
        </mesh>
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
