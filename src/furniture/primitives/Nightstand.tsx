import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

/** Bedside cabinet with two drawer fronts and short legs. */
export function Nightstand({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.45);
  const depth = readNum(props, 'depth', 0.4);
  const color = readStr(props, 'color', '#8a6b48');

  const legH = 0.1;
  const bodyH = 0.42;
  const wood = { color, roughness: STYLISED_ROUGHNESS, metalness: STYLISED_METALNESS };

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, legH + bodyH / 2, 0]}>
        <boxGeometry args={[width, bodyH, depth]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {/* Two recessed drawer fronts + knobs */}
      {[0, 1].map((i) => {
        const cy = legH + bodyH * (i === 0 ? 0.72 : 0.28);
        return (
          <group key={i}>
            <mesh position={[0, cy, depth / 2 + 0.003]}>
              <boxGeometry args={[width * 0.84, bodyH * 0.38, 0.02]} />
              <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
            </mesh>
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, cy, depth / 2 + 0.025]}>
              <cylinderGeometry args={[0.016, 0.016, 0.035, 10]} />
              <meshStandardMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
            </mesh>
          </group>
        );
      })}
      {/* Legs */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}.${sz}`} castShadow position={[sx * (width / 2 - 0.05), legH / 2, sz * (depth / 2 - 0.05)]}>
            <boxGeometry args={[0.04, legH, 0.04]} />
            <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.1} />
          </mesh>
        )),
      )}
    </group>
  );
}
