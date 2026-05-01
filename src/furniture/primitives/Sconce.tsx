import { readStr } from './shared';
import type { ParamProps } from '../types';

export function Sconce({ props }: { props: ParamProps }) {
  const bodyColor = readStr(props, 'bodyColor', '#2a2a2a');
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 1.7, 0.04]}>
        <boxGeometry args={[0.16, 0.06, 0.08]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 1.7, 0.12]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
