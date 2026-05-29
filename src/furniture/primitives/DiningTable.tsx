import { readStr } from './shared';
import { getWoodMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface DiningTableProps {
  props: ParamProps;
}

const SEAT_DIMENSIONS: Record<string, { w: number; d: number }> = {
  '4': { w: 1.4, d: 0.85 },
  '6': { w: 1.8, d: 0.95 },
  '8': { w: 2.2, d: 1.00 },
};

/**
 * Dining table primitive: rectangular top + 4 legs.
 * Footprint width/depth are derived from the `seats` enum so the
 * inspector exposes a single dropdown rather than two sliders.
 */
export function DiningTable({ props }: DiningTableProps) {
  const seatsKey = readStr(props, 'seats', '4');
  const dim = SEAT_DIMENSIONS[seatsKey] ?? SEAT_DIMENSIONS['4'];
  const topColor = readStr(props, 'topColor', '#9e7b53');
  const legColor = readStr(props, 'legColor', '#5b4126');
  const finish = readStr(props, 'finish', 'wood');

  const topThickness = 0.04;
  const totalH = 0.74;
  const legThickness = 0.06;
  const legInset = 0.10;

  const legY = (totalH - topThickness) / 2;
  const xL = -dim.w / 2 + legInset + legThickness / 2;
  const xR = dim.w / 2 - legInset - legThickness / 2;
  const zN = -dim.d / 2 + legInset + legThickness / 2;
  const zS = dim.d / 2 - legInset - legThickness / 2;

  const legPositions: [number, number, number][] = [
    [xL, legY, zN],
    [xR, legY, zN],
    [xL, legY, zS],
    [xR, legY, zS],
  ];

  const topMat = getSurfaceMaterial(finish, topColor, 1.5);
  const legMat = getWoodMaterial(legColor, 0.5);
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, totalH - topThickness / 2, 0]} material={topMat}>
        <boxGeometry args={[dim.w, topThickness, dim.d]} />
      </mesh>
      {legPositions.map((p, i) => (
        <mesh key={i} castShadow position={p} material={legMat}>
          <boxGeometry args={[legThickness, totalH - topThickness, legThickness]} />
        </mesh>
      ))}
      {/* Apron rails just under the top, connecting the legs. */}
      {(() => {
        const apronH = 0.06;
        const apronY = totalH - topThickness - apronH / 2 - 0.01;
        const innerW = dim.w - legInset * 2;
        const innerD = dim.d - legInset * 2;
        return (
          <>
            {[zN, zS].map((z, i) => (
              <mesh key={`la${i}`} castShadow position={[0, apronY, z]} material={legMat}>
                <boxGeometry args={[innerW, apronH, 0.03]} />
              </mesh>
            ))}
            {[xL, xR].map((x, i) => (
              <mesh key={`wa${i}`} castShadow position={[x, apronY, 0]} material={legMat}>
                <boxGeometry args={[0.03, apronH, innerD]} />
              </mesh>
            ))}
          </>
        );
      })()}
    </group>
  );
}
