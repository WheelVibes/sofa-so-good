import { readStr } from './shared';
import type { ParamProps } from '../types';

/** Potted foliage plant: tapered pot + soil + clustered leafy spheres.
 *  `size` enum scales the whole plant. */
export function PottedPlant({ props }: { props: ParamProps }) {
  const sizeKey = readStr(props, 'size', 'medium');
  const potColor = readStr(props, 'potColor', '#b9743f');
  const leafColor = readStr(props, 'leafColor', '#3f6b3a');

  const scale = sizeKey === 'small' ? 0.7 : sizeKey === 'large' ? 1.35 : 1;

  const potH = 0.32;
  const potRTop = 0.2;
  const potRBot = 0.14;

  // Foliage blobs (low-poly icosahedra) clustered above the pot.
  const blobs: { p: [number, number, number]; r: number }[] = [
    { p: [0, potH + 0.32, 0], r: 0.26 },
    { p: [0.16, potH + 0.2, 0.05], r: 0.2 },
    { p: [-0.15, potH + 0.22, -0.06], r: 0.19 },
    { p: [0.02, potH + 0.5, -0.04], r: 0.18 },
    { p: [-0.05, potH + 0.16, 0.16], r: 0.16 },
  ];

  return (
    <group scale={scale}>
      {/* Pot */}
      <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
        <cylinderGeometry args={[potRTop, potRBot, potH, 20]} />
        <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, potH - 0.02, 0]}>
        <cylinderGeometry args={[potRTop - 0.02, potRTop - 0.02, 0.03, 20]} />
        <meshStandardMaterial color="#3a2a1c" roughness={1} />
      </mesh>
      {/* Stem */}
      <mesh castShadow position={[0, potH + 0.14, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.3, 8]} />
        <meshStandardMaterial color="#5a4324" roughness={0.9} />
      </mesh>
      {/* Foliage */}
      {blobs.map((b, i) => (
        <mesh key={i} castShadow position={b.p}>
          <icosahedronGeometry args={[b.r, 1]} />
          <meshStandardMaterial
            color={leafColor}
            roughness={0.85}
            metalness={0}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}
