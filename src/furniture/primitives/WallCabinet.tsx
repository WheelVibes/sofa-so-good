import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Run of kitchen upper/wall cabinets: a long body split into N doors with
 *  handles. Mounted high on the wall (group offset up in Y). Faces +Z. */
export function WallCabinet({ props }: { props: ParamProps }) {
  const length = readNum(props, 'length', 2.4);
  const mountH = readNum(props, 'mountHeight', 1.45); // underside height
  const color = readStr(props, 'color', '#e3dfd6');
  const finish = readStr(props, 'finish', 'painted');

  const h = 0.7;
  const d = 0.35;
  const doors = Math.max(1, Math.round(length / 0.6));
  const gap = 0.012;
  const doorW = (length - gap * (doors + 1)) / doors;
  const cy = mountH + h / 2;
  const cabMat = getSurfaceMaterial(finish, color);

  return (
    <group>
      {/* Carcass */}
      <mesh castShadow receiveShadow position={[0, cy, 0]} material={cabMat}>
        <boxGeometry args={[length, h, d]} />
      </mesh>
      {/* Doors + handles */}
      {Array.from({ length: doors }, (_, i) => {
        const x = -length / 2 + gap + doorW / 2 + i * (doorW + gap);
        const handleSide = i % 2 === 0 ? 1 : -1;
        return (
          <group key={i}>
            <mesh castShadow position={[x, cy, d / 2 - 0.005]} material={cabMat}>
              <boxGeometry args={[doorW, h - 0.04, 0.016]} />
            </mesh>
            <mesh castShadow position={[x + handleSide * (doorW / 2 - 0.04), cy - h / 2 + 0.08, d / 2 + 0.01]}>
              <boxGeometry args={[0.018, 0.1, 0.018]} />
              <meshStandardMaterial color="#8a8d92" roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
