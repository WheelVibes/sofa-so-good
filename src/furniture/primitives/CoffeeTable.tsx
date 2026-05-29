import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Low coffee table: top + lower shelf + four legs. */
export function CoffeeTable({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.1);
  const depth = readNum(props, 'depth', 0.55);
  const color = readStr(props, 'color', '#6f553f');

  const totalH = 0.42;
  const topT = 0.04;
  const legT = 0.05;
  const inset = legT / 2 + 0.03;
  const shelfY = 0.12;

  const wood = getWoodMaterial(color, 1.6);
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
