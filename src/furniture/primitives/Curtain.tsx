import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Pleated floor-length curtains on a rod. Modelled as overlapping vertical
 *  pleats with alternating depth to read as gathered fabric. Mounted against
 *  a wall (faces +Z). */
export function Curtain({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.8);
  const height = readNum(props, 'height', 2.3);
  const color = readStr(props, 'color', '#c4b9a6');

  const pleats = Math.max(6, Math.round(width / 0.14));
  const step = width / pleats;
  const fabricMat = getFabricMaterial(color);

  return (
    <group>
      {/* Rod */}
      <mesh position={[0, height + 0.04, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, width + 0.2, 10]} />
        <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.1), height + 0.04, 0.02]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Pleats */}
      {Array.from({ length: pleats }, (_, i) => {
        const x = -width / 2 + step / 2 + i * step;
        const z = Math.sin(i * 1.7) * 0.035;
        return (
          <mesh key={i} castShadow position={[x, height / 2, z]} material={fabricMat}>
            <boxGeometry args={[step * 1.25, height, 0.04]} />
          </mesh>
        );
      })}
    </group>
  );
}
