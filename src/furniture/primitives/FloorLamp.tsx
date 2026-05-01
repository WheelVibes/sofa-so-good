import { readStr } from './shared';
import type { ParamProps } from '../types';

export function FloorLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#e7dec5');
  return (
    <group>
      {/* base */}
      <mesh castShadow receiveShadow position={[0, 0.025, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
        <meshStandardMaterial color="#3a3a3a" />
      </mesh>
      {/* pole */}
      <mesh castShadow position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 1.6, 12]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* shade */}
      <mesh castShadow position={[0, 1.6, 0]}>
        <coneGeometry args={[0.18, 0.22, 24, 1, true]} />
        <meshStandardMaterial color={shadeColor} side={2} />
      </mesh>
      {/* bulb */}
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
