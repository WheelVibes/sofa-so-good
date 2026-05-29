import { readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
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

  const topMat = getWoodMaterial(topColor, 1.5);
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
    </group>
  );
}
