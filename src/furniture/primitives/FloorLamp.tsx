import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Floor lamp: a disc base + slim pole, or a splayed tripod, topped with an
 *  emissive shade (empire / drum / cone). The shade emissive tracks scene
 *  darkness (bright at night, off in day). */
export function FloorLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f3e6c8');
  const poleColor = readStr(props, 'poleColor', '#2b2b2b');
  const shade = readStr(props, 'shade', 'empire');
  const base = readStr(props, 'base', 'disc');

  const poleH = 1.5;
  const shadeH = 0.28;
  // Shade profile: [topRadius, bottomRadius]
  const profile: [number, number] =
    shade === 'drum' ? [0.2, 0.2] : shade === 'cone' ? [0.07, 0.26] : [0.16, 0.21];
  const tripod = base === 'tripod';
  const shadeRef = useRef<MeshStandardMaterial>(null);
  const bulbRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const g = getFixtureGlow();
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.05 + g * 0.6;
    if (bulbRef.current) bulbRef.current.emissiveIntensity = g * 1.1;
  });

  return (
    <group>
      {tripod ? (
        <>
          {/* Three splayed legs meeting just below the shade */}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2;
            const spread = 0.34;
            const fx = Math.sin(a) * spread;
            const fz = Math.cos(a) * spread;
            const legH = Math.hypot(poleH - 0.1, spread);
            const lean = Math.atan2(spread, poleH - 0.1);
            return (
              <mesh
                key={i}
                castShadow
                position={[fx / 2, (poleH - 0.1) / 2, fz / 2]}
                rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
              >
                <cylinderGeometry args={[0.016, 0.012, legH, 10]} />
                <meshStandardMaterial color={poleColor} roughness={0.45} metalness={0.4} />
              </mesh>
            );
          })}
          {/* Short upper stem to the shade */}
          <mesh castShadow position={[0, poleH - 0.05, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.3, 10]} />
            <meshStandardMaterial color={poleColor} roughness={0.45} metalness={0.4} />
          </mesh>
        </>
      ) : (
        <>
          {/* Disc base */}
          <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.16, 0.18, 0.04, 24]} />
            <meshStandardMaterial color={poleColor} roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Pole */}
          <mesh castShadow position={[0, poleH / 2, 0]}>
            <cylinderGeometry args={[0.018, 0.018, poleH, 12]} />
            <meshStandardMaterial color={poleColor} roughness={0.4} metalness={0.6} />
          </mesh>
        </>
      )}
      {/* Shade */}
      <mesh castShadow position={[0, poleH + shadeH / 2 - 0.02, 0]}>
        <cylinderGeometry args={[profile[0], profile[1], shadeH, 28, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.7}
          side={2}
        />
      </mesh>
      {/* Bulb glow disc at the bottom of the shade (faces down) */}
      <mesh position={[0, poleH + 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 20]} />
        <meshStandardMaterial ref={bulbRef} color="#fff6e0" emissive="#fff0d0" emissiveIntensity={0.1} />
      </mesh>
    </group>
  );
}
