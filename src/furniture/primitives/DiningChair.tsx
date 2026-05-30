import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getWoodMaterial, getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Dining chair: seat + back + four legs. Faces +Z (back at -Z). A 'wood'
 *  style is flat panels; 'upholstered' adds padded seat + back cushions. */
export function DiningChair({ props }: { props: ParamProps }) {
  const seatColor = readStr(props, 'seatColor', '#7a5c3c');
  const legColor = readStr(props, 'legColor', '#4e3a24');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const pattern = readStr(props, 'pattern', 'plain');
  const style = readStr(props, 'style', 'wood');
  const upholstered = style === 'upholstered';

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

  const seatMat = upholstered
    ? getUpholsteryMaterial('fabric', seatColor, sheen, pattern)
    : getSurfaceMaterial(finish, seatColor, 1, sheen);
  const legMat = getWoodMaterial(legColor, 0.4);

  return (
    <group>
      {upholstered ? (
        <>
          {/* Padded seat cushion */}
          <RoundedBox args={[seatW, 0.09, seatD]} radius={0.025} smoothness={3} castShadow receiveShadow position={[0, seatH - 0.045, 0]} material={seatMat} />
          {/* Padded back, slightly reclined */}
          <group position={[0, seatH, -seatD / 2 + 0.05]} rotation={[0.08, 0, 0]}>
            <RoundedBox args={[seatW, backH, 0.08]} radius={0.03} smoothness={3} castShadow position={[0, backH / 2, 0]} material={seatMat} />
          </group>
        </>
      ) : (
        <>
          <mesh castShadow receiveShadow position={[0, seatH - seatT / 2, 0]} material={seatMat}>
            <boxGeometry args={[seatW, seatT, seatD]} />
          </mesh>
          {/* Back rest */}
          <mesh castShadow position={[0, seatH + backH / 2, -seatD / 2 + legT / 2]} material={seatMat}>
            <boxGeometry args={[seatW, backH, legT]} />
          </mesh>
        </>
      )}
      {legs.map((p, i) => (
        <mesh key={i} castShadow position={p} material={legMat}>
          <boxGeometry args={[legT, seatH - seatT, legT]} />
        </mesh>
      ))}
    </group>
  );
}
