import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readNum, readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Table/bedside lamp: base + slim stem + tapered shade. Its geometry starts
 *  at `surfaceHeight` so it rests on a nightstand/desk. Shade emissive tracks
 *  scene darkness (glows at night). */
export function TableLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f0e4c4');
  const baseColor = readStr(props, 'baseColor', '#33363b');
  const surfaceH = readNum(props, 'surfaceHeight', 0.5);

  const stemH = 0.26;
  const shadeH = 0.16;
  const shadeRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.06 + getFixtureGlow() * 0.7;
  });

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Base */}
      <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.04, 20]} />
        <meshStandardMaterial color={baseColor} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Stem */}
      <mesh castShadow position={[0, stemH / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, stemH, 10]} />
        <meshStandardMaterial color={baseColor} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Shade */}
      <mesh castShadow position={[0, stemH + shadeH / 2 - 0.02, 0]}>
        <cylinderGeometry args={[0.11, 0.15, shadeH, 24, 1, true]} />
        <meshStandardMaterial
          ref={shadeRef}
          color={shadeColor}
          emissive={shadeColor}
          emissiveIntensity={0.1}
          roughness={0.7}
          side={2}
        />
      </mesh>
    </group>
  );
}
