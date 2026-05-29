import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Pedestal / standing fan — a near-universal Singapore-home fixture: round
 *  weighted base, telescopic pole, and a circular head (hub + blades behind a
 *  wire guard). Faces +Z (blows toward +Z). */
export function StandingFan({ props }: { props: ParamProps }) {
  const headH = readNum(props, 'height', 1.1);
  const bodyColor = readStr(props, 'bodyColor', '#e8e6e1');
  const bladeColor = readStr(props, 'bladeColor', '#dcddd8');

  const r = 0.21; // head radius
  const body = { color: bodyColor, roughness: 0.5, metalness: 0.2 } as const;
  const guard = { color: '#c2c4c0', roughness: 0.4, metalness: 0.5 } as const;

  // Gentle blade spin, matching the ceiling fan's "alive" motion.
  const bladesRef = useRef<Group>(null);
  useFrame((_, dt) => {
    if (bladesRef.current) bladesRef.current.rotation.z += dt * 4;
  });

  return (
    <group>
      {/* Weighted base */}
      <mesh castShadow receiveShadow position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.24, 0.27, 0.05, 28]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Pole */}
      <mesh castShadow position={[0, headH / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.025, headH, 12]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Head assembly, tilted slightly up */}
      <group position={[0, headH, 0]} rotation={[-0.12, 0, 0]}>
        {/* Rear motor housing */}
        <mesh castShadow position={[0, 0, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.12, 20]} />
          <meshStandardMaterial {...body} />
        </mesh>
        {/* Spinning hub + blades (rotates about the fan's local Z axis) */}
        <group ref={bladesRef} position={[0, 0, 0.01]}>
          {/* Hub */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.04, 16]} />
            <meshStandardMaterial color="#9a9c98" roughness={0.4} metalness={0.5} />
          </mesh>
          {/* Five blades fanning around the hub */}
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0.01]} rotation={[0, 0, -a]}>
                <boxGeometry args={[0.09, 0.17, 0.006]} />
                <meshStandardMaterial color={bladeColor} roughness={0.5} metalness={0.1} side={2} />
              </mesh>
            );
          })}
        </group>
        {/* Wire guard (front + rim) */}
        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.012, 8, 32]} />
          <meshStandardMaterial {...guard} />
        </mesh>
        <mesh position={[0, 0, 0.04]}>
          <torusGeometry args={[r * 0.6, 0.008, 8, 28]} />
          <meshStandardMaterial {...guard} />
        </mesh>
      </group>
    </group>
  );
}
