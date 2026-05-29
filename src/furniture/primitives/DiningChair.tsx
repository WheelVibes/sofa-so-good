import { readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Dining chair: seat + back + four legs. Faces +Z (back at -Z). */
export function DiningChair({ props }: { props: ParamProps }) {
  const seatColor = readStr(props, 'seatColor', '#7a5c3c');
  const legColor = readStr(props, 'legColor', '#4e3a24');

  const seatH = 0.46;
  const seatW = 0.44;
  const seatD = 0.44;
  const seatT = 0.05;
  const backH = 0.46;
  const legT = 0.04;
  const inset = legT / 2 + 0.02;

  const legY = (seatH - seatT) / 2;
  const xs = [-seatW / 2 + inset, seatW / 2 - inset];
  const zs = [-seatD / 2 + inset, seatD / 2 - inset];
  const legs: [number, number, number][] = [];
  for (const x of xs) for (const z of zs) legs.push([x, legY, z]);

  const seatMat = getWoodMaterial(seatColor, 1);
  const legMat = getWoodMaterial(legColor, 0.4);

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, seatH - seatT / 2, 0]} material={seatMat}>
        <boxGeometry args={[seatW, seatT, seatD]} />
      </mesh>
      {/* Back rest */}
      <mesh castShadow position={[0, seatH + backH / 2, -seatD / 2 + legT / 2]} material={seatMat}>
        <boxGeometry args={[seatW, backH, legT]} />
      </mesh>
      {legs.map((p, i) => (
        <mesh key={i} castShadow position={p} material={legMat}>
          <boxGeometry args={[legT, seatH - seatT, legT]} />
        </mesh>
      ))}
    </group>
  );
}
