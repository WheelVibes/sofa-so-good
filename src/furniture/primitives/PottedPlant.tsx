import { readStr } from './shared';
import { hexToRgb } from '../../materials/procedural/noise';
import type { ParamProps } from '../types';

/** Potted foliage plant: tapered pot + soil + a full clustered canopy of
 *  leafy blobs (with green variation) and a few upward leaf fronds.
 *  `size` enum scales the whole plant. */
export function PottedPlant({ props }: { props: ParamProps }) {
  const sizeKey = readStr(props, 'size', 'medium');
  const potColor = readStr(props, 'potColor', '#b9743f');
  const leafColor = readStr(props, 'leafColor', '#3f6b3a');

  const scale = sizeKey === 'small' ? 0.7 : sizeKey === 'large' ? 1.35 : 1;

  const potH = 0.32;
  const potRTop = 0.2;
  const potRBot = 0.14;

  // Shade a hex by a factor for canopy depth variation.
  const [lr, lg, lb] = hexToRgb(leafColor);
  const tint = (f: number) =>
    `rgb(${Math.round(Math.min(255, lr * f))},${Math.round(Math.min(255, lg * f))},${Math.round(Math.min(255, lb * f))})`;

  // Fuller canopy: more blobs, varied size/shade. f<1 = shadowed interior.
  const blobs: { p: [number, number, number]; r: number; f: number }[] = [
    { p: [0, potH + 0.34, 0], r: 0.27, f: 1.0 },
    { p: [0.18, potH + 0.22, 0.06], r: 0.21, f: 0.82 },
    { p: [-0.17, potH + 0.24, -0.07], r: 0.2, f: 0.86 },
    { p: [0.03, potH + 0.54, -0.05], r: 0.19, f: 1.12 },
    { p: [-0.06, potH + 0.18, 0.18], r: 0.17, f: 0.78 },
    { p: [0.14, potH + 0.42, -0.14], r: 0.18, f: 1.05 },
    { p: [-0.16, potH + 0.44, 0.1], r: 0.17, f: 0.95 },
    { p: [0.1, potH + 0.3, 0.17], r: 0.16, f: 0.9 },
    { p: [-0.02, potH + 0.66, 0.04], r: 0.14, f: 1.18 },
  ];

  // A few leaf fronds poking out of the canopy.
  const fronds: { p: [number, number, number]; rot: [number, number, number] }[] = [
    { p: [0.05, potH + 0.7, 0.0], rot: [0.2, 0, 0.2] },
    { p: [-0.1, potH + 0.6, 0.08], rot: [0.3, 1, -0.3] },
    { p: [0.12, potH + 0.58, -0.06], rot: [-0.2, -0.8, 0.4] },
  ];

  return (
    <group scale={scale}>
      {/* Pot */}
      <mesh castShadow receiveShadow position={[0, potH / 2, 0]}>
        <cylinderGeometry args={[potRTop, potRBot, potH, 20]} />
        <meshStandardMaterial color={potColor} roughness={0.85} metalness={0.02} />
      </mesh>
      {/* Rim */}
      <mesh castShadow position={[0, potH, 0]}>
        <cylinderGeometry args={[potRTop + 0.012, potRTop, 0.04, 20]} />
        <meshStandardMaterial color={potColor} roughness={0.8} metalness={0.02} />
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
      {/* Canopy */}
      {blobs.map((b, i) => (
        <mesh key={i} castShadow position={b.p}>
          <icosahedronGeometry args={[b.r, 1]} />
          <meshStandardMaterial color={tint(b.f)} roughness={0.85} metalness={0} flatShading />
        </mesh>
      ))}
      {/* Fronds */}
      {fronds.map((f, i) => (
        <mesh key={`f${i}`} castShadow position={f.p} rotation={f.rot}>
          <coneGeometry args={[0.05, 0.34, 5]} />
          <meshStandardMaterial color={tint(1.1)} roughness={0.85} metalness={0} flatShading />
        </mesh>
      ))}
    </group>
  );
}
