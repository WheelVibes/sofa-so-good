import { readStr } from './shared';
import type { ParamProps } from '../types';

export function Pendant({ props }: { props: ParamProps }) {
  const shadeColor = readStr(props, 'shadeColor', '#e7dec5');
  return (
    <group>
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.6, 6]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <mesh castShadow position={[0, 2.0, 0]}>
        <sphereGeometry args={[0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={shadeColor} side={2} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial emissive="#fff2cc" emissiveIntensity={1.2} color="#fff" />
      </mesh>
    </group>
  );
}
