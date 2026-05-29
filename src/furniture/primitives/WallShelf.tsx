import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Floating wall shelf — a single plank on two L-brackets, wall-mounted.
 *  Sits flat against the wall behind it (group offset to the mount height)
 *  and extends forward in +Z. Pair with tabletop decor to style a wall. */
export function WallShelf({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8);
  const depth = readNum(props, 'depth', 0.22);
  const centerY = readNum(props, 'mountHeight', 1.4);
  const color = readStr(props, 'color', '#8a6b48');

  const plankT = 0.035;
  const wood = getWoodMaterial(color, 1.2);
  // Brackets sit a little in from each end.
  const bx = width / 2 - 0.08;
  const bracketColor = '#2b2b2b';

  return (
    <group position={[0, centerY, 0]}>
      {/* Plank, extending forward from the wall */}
      <mesh castShadow receiveShadow position={[0, 0, depth / 2]} material={wood}>
        <boxGeometry args={[width, plankT, depth]} />
      </mesh>
      {/* L-brackets under each end */}
      {[-bx, bx].map((x, i) => (
        <group key={i}>
          {/* vertical leg against the wall */}
          <mesh castShadow position={[x, -0.06, 0.012]}>
            <boxGeometry args={[0.02, 0.1, 0.02]} />
            <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
          </mesh>
          {/* horizontal leg under the plank */}
          <mesh castShadow position={[x, -plankT / 2 - 0.01, depth * 0.35]}>
            <boxGeometry args={[0.02, 0.02, depth * 0.6]} />
            <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
