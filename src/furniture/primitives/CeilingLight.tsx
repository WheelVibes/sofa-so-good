import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MeshStandardMaterial } from 'three';
import { readNum, readStr } from './shared';
import { getFixtureGlow } from '../../scene/lighting/fixtureGlow';
import type { ParamProps } from '../types';

/** Ceiling-mounted fixture: a flush disc or a pendant dome hung from the
 *  ceiling. Floor-anchored group → body offset up in Y to the mount height.
 *  Emissive so it reads as lit. */
export function CeilingLight({ props }: { props: ParamProps }) {
  const style = readStr(props, 'style', 'pendant');
  const shadeColor = readStr(props, 'shadeColor', '#f2ead6');
  const mountH = readNum(props, 'mountHeight', 2.55);
  const drop = style === 'pendant' ? readNum(props, 'drop', 0.45) : 0;
  const fixtureY = mountH - drop;
  const shadeRef = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (shadeRef.current) shadeRef.current.emissiveIntensity = 0.06 + getFixtureGlow() * 0.7;
  });

  return (
    <group position={[0, fixtureY, 0]}>
      {/* Ceiling rose */}
      <mesh position={[0, drop + 0.01, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
        <meshStandardMaterial color="#d8d4cc" roughness={0.6} />
      </mesh>
      {style === 'pendant' ? (
        <>
          {/* Cord */}
          <mesh position={[0, drop / 2, 0]}>
            <cylinderGeometry args={[0.005, 0.005, drop, 6]} />
            <meshStandardMaterial color="#2b2b2b" roughness={0.8} />
          </mesh>
          {/* Dome shade */}
          <mesh castShadow position={[0, 0, 0]}>
            <sphereGeometry args={[0.18, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              ref={shadeRef}
              color={shadeColor}
              emissive={shadeColor}
              emissiveIntensity={0.1}
              roughness={0.6}
              side={2}
            />
          </mesh>
        </>
      ) : (
        // Flush ceiling disc
        <mesh castShadow position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.06, 28]} />
          <meshStandardMaterial
            ref={shadeRef}
            color={shadeColor}
            emissive={shadeColor}
            emissiveIntensity={0.1}
            roughness={0.5}
          />
        </mesh>
      )}
    </group>
  );
}
