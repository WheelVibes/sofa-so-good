import { readStr } from './shared';
import type { ParamProps } from '../types';

/** Pedestal basin with a chrome mixer tap. Faces +Z. */
export function BathroomSink({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#f4f4f1');
  const porcelain = { color, roughness: 0.16, metalness: 0.02 };
  const chrome = { color: '#cdd2d6', roughness: 0.2, metalness: 0.85 };

  const basinY = 0.82;

  return (
    <group>
      {/* Pedestal */}
      <mesh castShadow receiveShadow position={[0, basinY / 2, -0.02]}>
        <cylinderGeometry args={[0.09, 0.13, basinY, 16]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Basin bowl */}
      <mesh castShadow position={[0, basinY, 0]}>
        <cylinderGeometry args={[0.22, 0.16, 0.16, 24]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      {/* Basin hollow (darker inner) */}
      <mesh position={[0, basinY + 0.04, 0]}>
        <cylinderGeometry args={[0.18, 0.12, 0.1, 24]} />
        <meshStandardMaterial color="#e2e2de" roughness={0.2} />
      </mesh>
      {/* Tap */}
      <mesh castShadow position={[0, basinY + 0.13, -0.16]}>
        <cylinderGeometry args={[0.015, 0.015, 0.18, 10]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[0, basinY + 0.21, -0.12]} rotation={[0.7, 0, 0]}>
        <cylinderGeometry args={[0.013, 0.013, 0.12, 10]} />
        <meshStandardMaterial {...chrome} />
      </mesh>
    </group>
  );
}
