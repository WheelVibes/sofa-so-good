import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Bedside cabinet with two drawer fronts and short legs. */
export function Nightstand({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.45);
  const depth = readNum(props, 'depth', 0.4);
  const color = readStr(props, 'color', '#8a6b48');

  const legH = 0.1;
  const bodyH = 0.42;
  const wood = getWoodMaterial(color, 1);

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, legH + bodyH / 2, 0]} material={wood}>
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>
      {/* Two recessed drawer fronts + knobs */}
      {[0, 1].map((i) => {
        const cy = legH + bodyH * (i === 0 ? 0.72 : 0.28);
        return (
          <group key={i}>
            <mesh position={[0, cy, depth / 2 + 0.003]} material={wood}>
              <boxGeometry args={[width * 0.84, bodyH * 0.38, 0.02]} />
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
