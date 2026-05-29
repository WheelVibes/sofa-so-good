import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Low coffee table. A 'rect' top has a lower shelf + four square legs; a
 *  'round' top (≈90cm dia, grounded in IKEA Listerby) and 'oval' top
 *  (Stockholm-style elongated veneer) sit on four slightly splayed round
 *  legs with a low ring/strut for stability. Faces +Z. */
export function CoffeeTable({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.1);
  const depth = readNum(props, 'depth', 0.55);
  const color = readStr(props, 'color', '#6f553f');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const shape = readStr(props, 'shape', 'rect');

  const totalH = 0.42;
  const topT = 0.04;
  const legT = 0.05;
  const inset = legT / 2 + 0.03;
  const shelfY = 0.12;

  const wood = getSurfaceMaterial(finish, color, 1.6, sheen);

  if (shape === 'round' || shape === 'oval') {
    // Round uses width as diameter; oval stretches along X (width) and is
    // shallower in Z (depth), matching real elongated coffee tables.
    const rx = width / 2;
    const rz = shape === 'oval' ? depth / 2 : width / 2;
    const legR = 0.025;
    const legH = totalH - topT;
    // Legs sit inboard of the rim and splay outward slightly toward the floor.
    const lx = rx - 0.12;
    const lz = rz - 0.12;
    const corners: [number, number][] = [
      [-lx, -lz],
      [lx, -lz],
      [-lx, lz],
      [lx, lz],
    ];
    return (
      <group>
        {/* Round/oval top: a flat cylinder scaled in Z for the oval. */}
        <mesh
          castShadow
          receiveShadow
          position={[0, totalH - topT / 2, 0]}
          scale={[1, 1, shape === 'oval' ? rz / rx : 1]}
          material={wood}
        >
          <cylinderGeometry args={[rx, rx, topT, 48]} />
        </mesh>
        {/* Splayed round legs */}
        {corners.map(([x, z], i) => {
          const ang = 0.06; // outward splay
          return (
            <mesh
              key={i}
              castShadow
              position={[x, legH / 2, z]}
              rotation={[Math.sign(z) * -ang, 0, Math.sign(x) * ang]}
              material={wood}
            >
              <cylinderGeometry args={[legR * 0.8, legR, legH, 16]} />
            </mesh>
          );
        })}
        {/* Low cross-strut for stability (reads as a stretcher) */}
        <mesh castShadow position={[0, legH * 0.32, 0]} material={wood}>
          <boxGeometry args={[lx * 2 + legR, 0.025, 0.025]} />
        </mesh>
      </group>
    );
  }

  const xs = [-width / 2 + inset, width / 2 - inset];
  const zs = [-depth / 2 + inset, depth / 2 - inset];
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, totalH - topT / 2, 0]} material={wood}>
        <boxGeometry args={[width, topT, depth]} />
      </mesh>
      <mesh castShadow position={[0, shelfY, 0]} material={wood}>
        <boxGeometry args={[width - inset * 2, 0.03, depth - inset * 2]} />
      </mesh>
      {xs.map((x) =>
        zs.map((z) => (
          <mesh key={`${x}.${z}`} castShadow position={[x, (totalH - topT) / 2, z]} material={wood}>
            <boxGeometry args={[legT, totalH - topT, legT]} />
          </mesh>
        )),
      )}
    </group>
  );
}
