import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Flat area rug with a contrasting border. Sits just above the floor. */
export function Rug({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 2.0);
  const depth = readNum(props, 'depth', 1.4);
  const color = readStr(props, 'color', '#9c8f7a');
  const border = readStr(props, 'borderColor', '#6e5f4c');

  return (
    <group>
      {/* Border slab */}
      <mesh receiveShadow position={[0, 0.006, 0]}>
        <boxGeometry args={[width, 0.012, depth]} />
        <meshStandardMaterial color={border} roughness={0.95} metalness={0} />
      </mesh>
      {/* Inner field, slightly inset and higher to avoid z-fighting */}
      <mesh receiveShadow position={[0, 0.013, 0]}>
        <boxGeometry args={[width - 0.16, 0.012, depth - 0.16]} />
        <meshStandardMaterial color={color} roughness={0.97} metalness={0} />
      </mesh>
    </group>
  );
}
