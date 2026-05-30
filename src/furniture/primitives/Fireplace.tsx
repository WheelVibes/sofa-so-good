import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/**
 * Electric fireplace — a wall-mounted linear unit (or a floor console with a
 * mantel) with a recessed firebox whose flame bed glows warm, ramping up at
 * night via the shared fixture-glow signal. `style` is 'wall' (mounted) or
 * 'console' (floor, with a hearth + mantel). Faces +Z.
 */
export function Fireplace({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2);
  const color = readStr(props, 'color', '#23242a');
  const finish = readStr(props, 'finish', 'gloss');
  const flameColor = readStr(props, 'flameColor', '#ff7a1a');
  const style = readStr(props, 'style', 'wall');
  const mountH = readNum(props, 'mountHeight', 1.0);

  const surround = getSurfaceMaterial(finish, color, 1.4, 0.4);
  const flameRef = useRef<MeshStandardMaterial>(null);
  const emberRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    const g = getFixtureGlow();
    // Flames read faintly even in daylight, blaze at night.
    if (flameRef.current) flameRef.current.emissiveIntensity = 0.5 + g * 1.6;
    if (emberRef.current) emberRef.current.emissiveIntensity = 0.3 + g * 1.0;
  });

  const h = 0.52;
  const depth = style === 'console' ? 0.34 : 0.16;
  const baseY = style === 'console' ? 0.45 : mountH; // centre Y of the firebox

  return (
    <group>
      {/* Console body / hearth (floor style) */}
      {style === 'console' && (
        <mesh castShadow receiveShadow position={[0, 0.3, 0]} material={surround}>
          <boxGeometry args={[width + 0.3, 0.6, depth + 0.06]} />
        </mesh>
      )}
      {/* Surround frame */}
      <mesh castShadow receiveShadow position={[0, baseY, 0]} material={surround}>
        <boxGeometry args={[width, h, depth]} />
      </mesh>
      {/* Firebox cavity (dark) */}
      <mesh position={[0, baseY, depth / 2 + 0.002]}>
        <planeGeometry args={[width - 0.12, h - 0.12]} />
        <meshStandardMaterial color="#0c0c0e" roughness={0.9} />
      </mesh>
      {/* Flame bed (emissive) */}
      <mesh position={[0, baseY - (h - 0.12) / 2 + 0.1, depth / 2 + 0.006]}>
        <planeGeometry args={[width - 0.18, 0.18]} />
        <meshStandardMaterial ref={flameRef} color={flameColor} emissive={flameColor} emissiveIntensity={0.6} transparent opacity={0.92} />
      </mesh>
      {/* Ember strip along the base */}
      <mesh position={[0, baseY - (h - 0.12) / 2 + 0.03, depth / 2 + 0.008]}>
        <planeGeometry args={[width - 0.16, 0.05]} />
        <meshStandardMaterial ref={emberRef} color="#ff4a10" emissive="#ff4a10" emissiveIntensity={0.4} />
      </mesh>
      {/* Mantel shelf (console style) */}
      {style === 'console' && (
        <mesh castShadow position={[0, baseY + h / 2 + 0.04, 0.02]} material={surround}>
          <boxGeometry args={[width + 0.4, 0.06, depth + 0.16]} />
        </mesh>
      )}
    </group>
  );
}
