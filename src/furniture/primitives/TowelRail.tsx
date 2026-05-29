import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Wall-mounted towel rail — a chromed bar on two brackets with a folded
 *  towel draped over it. Mounted on a wall (group offset to height); faces
 *  +Z so the towel hangs into the room. */
export function TowelRail({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6);
  const centerY = readNum(props, 'mountHeight', 1.1);
  const towelColor = readStr(props, 'towelColor', '#d9e2e6');

  const metal = { color: '#c6c9cd', roughness: 0.3, metalness: 0.8 } as const;
  const towelMat = getFabricMaterial(towelColor);
  const barR = 0.012;
  const proj = 0.07; // bracket projection from wall

  return (
    <group position={[0, centerY, 0]}>
      {/* Bar */}
      <mesh castShadow position={[0, 0, proj]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[barR, barR, width, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Brackets */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * width) / 2, 0, proj / 2]}>
          <boxGeometry args={[0.015, 0.03, proj]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      ))}
      {/* Draped towel — front and back panels hanging over the bar, with a
          rounded fold at the top. */}
      <group position={[0, 0, proj]}>
        <mesh castShadow position={[0, -0.18, 0.018]} material={towelMat}>
          <boxGeometry args={[width * 0.7, 0.38, 0.02]} />
        </mesh>
        <mesh castShadow position={[0, -0.16, -0.018]} material={towelMat}>
          <boxGeometry args={[width * 0.7, 0.34, 0.02]} />
        </mesh>
        {/* Top fold cap over the bar */}
        <mesh castShadow position={[0, 0.012, 0]} material={towelMat}>
          <boxGeometry args={[width * 0.7, 0.03, 0.055]} />
        </mesh>
      </group>
    </group>
  );
}
