import { readNum, readStr } from './shared';
import { getFabricMaterial, getGradientFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Flat area rug with a contrasting border. Sits just above the floor.
 *  Uses the woven-fabric material so it reads as a textile, not flat paint.
 *  `pattern: 'gradient'` blends the field from `color` to `color2` (ombre). */
export function Rug({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 2.0);
  const depth = readNum(props, 'depth', 1.4);
  const color = readStr(props, 'color', '#9c8f7a');
  const color2 = readStr(props, 'color2', '#c4b9a6');
  const border = readStr(props, 'borderColor', '#6e5f4c');
  const pattern = readStr(props, 'pattern', 'solid');

  const fieldMat =
    pattern === 'gradient' ? getGradientFabricMaterial(color, color2) : getFabricMaterial(color);

  return (
    <group>
      {/* Border slab */}
      <mesh receiveShadow position={[0, 0.006, 0]} material={getFabricMaterial(border)}>
        <boxGeometry args={[width, 0.012, depth]} />
      </mesh>
      {/* Inner field, slightly inset and higher to avoid z-fighting */}
      <mesh receiveShadow position={[0, 0.013, 0]} material={fieldMat}>
        <boxGeometry args={[width - 0.16, 0.012, depth - 0.16]} />
      </mesh>
    </group>
  );
}
