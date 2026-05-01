import { readStr } from './shared';
import type { ParamProps } from '../types';

export function TableLamp({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#f3ecda');
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 20]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh castShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.4, 8]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <coneGeometry args={[0.12, 0.18, 20, 1, true]} />
        <meshStandardMaterial color={shadeColor} side={2} />
      </mesh>
      <mesh position={[0, 0.46, 0]}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
