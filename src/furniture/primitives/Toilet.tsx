import { readStr } from './shared';
import type { ParamProps } from '../types';

/** Close-coupled WC: pedestal bowl + seat + cistern. Faces +Z (cistern at
 *  -Z, against the wall). */
export function Toilet({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1');
  const porcelain = { color, roughness: 0.18, metalness: 0.02 };

  return (
    <group>
      {/* Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0.04]}>
        <cylinderGeometry args={[0.13, 0.17, 0.36, 18]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Bowl */}
      <mesh castShadow position={[0, 0.38, 0.06]}>
        <cylinderGeometry args={[0.2, 0.16, 0.14, 20]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Seat ring */}
      <mesh castShadow position={[0, 0.45, 0.06]}>
        <torusGeometry args={[0.16, 0.035, 10, 22]} />
        <meshStandardMaterial color="#ffffff" roughness={0.25} />
      </mesh>
      {/* Lid back */}
      <mesh position={[0, 0.47, -0.14]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.34, 0.02, 0.18]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Cistern */}
      <mesh castShadow position={[0, 0.55, -0.22]}>
        <boxGeometry args={[0.38, 0.4, 0.16]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Flush button */}
      <mesh position={[0, 0.76, -0.22]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#c0c4c8" roughness={0.3} metalness={0.6} />
      </mesh>
    </group>
  );
}
