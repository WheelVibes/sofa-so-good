import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readNum, readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Wall sconce — a small up/down wall light. Mounted flat against the wall
 *  (group offset to the mount height), with a frosted diffuser that glows at
 *  night (emissive tracks scene darkness). Faces +Z into the room. */
export function WallSconce({ props }: { props: ParamProps }) {
  const centerY = readNum(props, 'mountHeight', 1.7);
  const shadeColor = readStr(props, 'shadeColor', '#f3e7c6');
  const metalColor = readStr(props, 'metalColor', '#2c2f33');

  const shadeRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.05 + getFixtureGlow() * 0.9;
  });

  return (
    <group position={[0, centerY, 0]}>
      {/* Backplate against the wall */}
      <mesh castShadow position={[0, 0, 0.01]}>
        <boxGeometry args={[0.1, 0.16, 0.02]} />
        <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Short arm */}
      <mesh castShadow position={[0, 0, 0.06]}>
        <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
        <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Frosted diffuser cylinder, open-ended, glowing */}
      <mesh castShadow position={[0, 0, 0.11]}>
        <cylinderGeometry args={[0.06, 0.07, 0.2, 20, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.6}
          side={2}
        />
      </mesh>
    </group>
  );
}
