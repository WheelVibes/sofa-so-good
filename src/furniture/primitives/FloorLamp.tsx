import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Floor lamp: weighted base + slim pole + emissive drum/cone shade.
 *  The shade emissive tracks scene darkness (bright at night, off in day). */
export function FloorLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f3e6c8');
  const poleColor = readStr(props, 'poleColor', '#2b2b2b');

  const poleH = 1.5;
  const shadeH = 0.28;
  const shadeRef = useRef<MeshStandardMaterial>(null);
  const bulbRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const g = getFixtureGlow();
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.05 + g * 0.6;
    if (bulbRef.current) bulbRef.current.emissiveIntensity = g * 1.1;
  });

  return (
    <group>
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.04, 24]} />
        <meshStandardMaterial color={poleColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Pole */}
      <mesh castShadow position={[0, poleH / 2, 0]}>
        <cylinderGeometry args={[0.018, 0.018, poleH, 12]} />
        <meshStandardMaterial color={poleColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Shade */}
      <mesh castShadow position={[0, poleH + shadeH / 2 - 0.02, 0]}>
        <cylinderGeometry args={[0.16, 0.21, shadeH, 24, 1, true]} />
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
