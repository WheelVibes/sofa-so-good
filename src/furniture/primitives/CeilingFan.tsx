import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, MeshStandardMaterial } from 'three';
import { readNum, readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Ceiling fan with a downrod, motor housing, spinning blades, and an
 *  integrated light. Mounted near the ceiling (group offset up in Y). */
export function CeilingFan({ props }: { props: ParamProps }) {
  const bladeCount = Math.max(2, Math.floor(readNum(props, 'blades', 3)));
  const span = readNum(props, 'span', 1.3); // tip-to-tip diameter
  const mountH = readNum(props, 'mountHeight', 2.5);
  const bladeColor = readStr(props, 'bladeColor', '#6b4f34');
  const bladesRef = useRef<Group>(null);
  const lightRef = useRef<MeshStandardMaterial>(null);

  useFrame((_, dt) => {
    if (bladesRef.current) bladesRef.current.rotation.y += dt * 3.2;
    if (lightRef.current) lightRef.current.emissiveIntensity = 0.05 + getFixtureGlow() * 0.8;
  });

  const dropY = mountH - 0.25;
  const bladeLen = span / 2 - 0.08;

  return (
    <group position={[0, dropY, 0]}>
      {/* Downrod */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.4, 8]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Motor housing */}
      <mesh castShadow position={[0, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.12, 20]} />
        <meshStandardMaterial color="#d8d8d4" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Light */}
      <mesh position={[0, -0.09, 0]}>
        <sphereGeometry args={[0.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial ref={lightRef} color="#fff3da" emissive="#ffeec8" emissiveIntensity={0.1} />
      </mesh>
      {/* Blades */}
      <group ref={bladesRef} position={[0, 0.02, 0]}>
        {Array.from({ length: bladeCount }, (_, i) => {
          const a = (i / bladeCount) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <mesh castShadow position={[bladeLen / 2 + 0.08, 0, 0]} rotation={[0.05, 0, 0]}>
                <boxGeometry args={[bladeLen, 0.012, 0.13]} />
                <meshStandardMaterial color={bladeColor} roughness={0.6} metalness={0.05} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}
