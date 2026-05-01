import { readStr } from './shared';
import type { ParamProps } from '../types';

export function CeilingSpot({ props }: { props: ParamProps }) {
  const bodyColor = readStr(props, 'bodyColor', '#1f1f1f');
  return (
    <group>
      <mesh position={[0, 2.55, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.04, 20]} />
        <meshStandardMaterial color={bodyColor} />
      </mesh>
      <mesh position={[0, 2.53, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.005, 20]} />
        <meshStandardMaterial emissive="#ffffff" emissiveIntensity={1.5} color="#fff" />
      </mesh>
    </group>
  );
}
