import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Flat area rug with a contrasting border. Sits just above the floor.
 *  Uses the woven-fabric material so it reads as a textile, not flat paint. */
export function Rug({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 2.0);
  const depth = readNum(props, 'depth', 1.4);
  const color = readStr(props, 'color', '#9c8f7a');
  const border = readStr(props, 'borderColor', '#6e5f4c');

  return (
    <group>
      {/* Border slab */}
      <mesh receiveShadow position={[0, 0.006, 0]} material={getFabricMaterial(border)}>
        <boxGeometry args={[width, 0.012, depth]} />
      </mesh>
      {/* Inner field, slightly inset and higher to avoid z-fighting */}
      <mesh receiveShadow position={[0, 0.013, 0]} material={getFabricMaterial(color)}>
        <boxGeometry args={[width - 0.16, 0.012, depth - 0.16]} />
      </mesh>
    </group>
  );
}
