import { readStr } from './shared';
import { hexToRgb } from '../../materials/procedural/noise';
import type { ParamProps } from '../types';

/** Potted foliage plant: tapered pot + soil + foliage. The `type` enum picks
 *  the silhouette — a clustered bush, an upright snake plant, or an arching
 *  palm — and `size` scales the whole plant. */
export function PottedPlant({ props }: { props: ParamProps }) {
  const sizeKey = readStr(props, 'size', 'medium');
  const type = readStr(props, 'type', 'bush');
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
      {type === 'bush' && (
        <>
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
        </>
      )}
      {type === 'snake' && (
        <>
          {/* Upright sword-like leaves fanning out of the pot. */}
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2;
            const ring = 0.06 + (i % 3) * 0.03;
            const h = 0.7 + ((i * 37) % 5) * 0.09;
            const lean = 0.12 + (i % 4) * 0.04;
            return (
              <mesh
                key={i}
                castShadow
                position={[Math.sin(a) * ring, potH + h / 2, Math.cos(a) * ring]}
                rotation={[Math.cos(a) * lean, a, -Math.sin(a) * lean]}
              >
                <boxGeometry args={[0.07, h, 0.012]} />
                <meshStandardMaterial color={tint(0.85 + (i % 3) * 0.12)} roughness={0.7} metalness={0} flatShading />
              </mesh>
            );
          })}
        </>
      )}
      {type === 'palm' && (
        <>
          {/* Slim trunk + arching fronds at the crown. */}
          <mesh castShadow position={[0, potH + 0.35, 0]}>
            <cylinderGeometry args={[0.022, 0.032, 0.7, 8]} />
            <meshStandardMaterial color="#6a5230" roughness={0.9} />
          </mesh>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2;
            const arch = 0.5 + (i % 3) * 0.06;
            return (
              <mesh
                key={i}
                castShadow
                position={[Math.sin(a) * 0.16, potH + 0.72, Math.cos(a) * 0.16]}
                rotation={[Math.cos(a) * 0.9, a, -Math.sin(a) * 0.9]}
              >
                <coneGeometry args={[0.06, arch, 4]} />
                <meshStandardMaterial color={tint(0.9 + (i % 3) * 0.1)} roughness={0.8} metalness={0} flatShading />
              </mesh>
            );
          })}
        </>
      )}
    </group>
  );
}
