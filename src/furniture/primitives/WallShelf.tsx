import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Floating wall shelf — a single plank on two L-brackets, wall-mounted.
 *  Sits flat against the wall behind it (group offset to the mount height)
 *  and extends forward in +Z. Pair with tabletop decor to style a wall. */
export function WallShelf({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8);
  const depth = readNum(props, 'depth', 0.22);
  const centerY = readNum(props, 'mountHeight', 1.4);
  const color = readStr(props, 'color', '#8a6b48');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const style = readStr(props, 'style', 'bracket');

  const plankT = 0.035;
  const wood = getSurfaceMaterial(finish, color, 1.2, sheen);
  const bx = width / 2 - 0.08;
  const bracketColor = '#2b2b2b';

  const plank = (y: number) => (
    <mesh castShadow receiveShadow position={[0, y, depth / 2]} material={wood}>
      <boxGeometry args={[width, plankT, depth]} />
    </mesh>
  );

  return (
    <group position={[0, centerY, 0]}>
      {style === 'twotier' ? (
        <>
          {/* Two stacked planks joined by short end panels */}
          {plank(0.16)}
          {plank(-0.16)}
          {[-bx, bx].map((x, i) => (
            <mesh key={i} castShadow position={[x, 0, depth * 0.55]} material={wood}>
              <boxGeometry args={[0.025, 0.32, depth * 0.85]} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {plank(0)}
          {/* Bracketed style shows L-brackets; floating hides them (hidden cleat) */}
          {style === 'bracket' &&
            [-bx, bx].map((x, i) => (
              <group key={i}>
                <mesh castShadow position={[x, -0.06, 0.012]}>
                  <boxGeometry args={[0.02, 0.1, 0.02]} />
                  <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
                </mesh>
                <mesh castShadow position={[x, -plankT / 2 - 0.01, depth * 0.35]}>
                  <boxGeometry args={[0.02, 0.02, depth * 0.6]} />
                  <meshStandardMaterial color={bracketColor} roughness={0.45} metalness={0.55} />
                </mesh>
              </group>
            ))}
        </>
      )}
    </group>
  );
}
