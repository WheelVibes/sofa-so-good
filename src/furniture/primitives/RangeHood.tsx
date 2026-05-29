import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Chimney range hood mounted above a stove: tapered canopy + duct cover.
 *  Mounted on the wall (group offset up in Y). Faces +Z (canopy opening down,
 *  duct against the wall at -Z). */
export function RangeHood({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.7);
  const mountH = readNum(props, 'mountHeight', 1.45); // canopy underside height
  const color = readStr(props, 'color', '#c4c8cc');
  const metal = { color, roughness: 0.35, metalness: 0.6 };

  const canopyH = 0.16;
  const depth = 0.45;

  return (
    <group position={[0, mountH, 0]}>
      {/* Canopy (wider at the bottom lip) */}
      <mesh castShadow receiveShadow position={[0, canopyH / 2, 0]}>
        <boxGeometry args={[width, canopyH, depth]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Lower glass/grease lip */}
      <mesh position={[0, 0.002, depth / 2 - 0.06]}>
        <boxGeometry args={[width - 0.04, 0.02, 0.16]} />
        <meshStandardMaterial color="#2b2e33" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Tapered transition up to the duct */}
      <mesh castShadow position={[0, canopyH + 0.12, -depth / 2 + 0.18]}>
        <cylinderGeometry args={[0.12, 0.2, 0.24, 4]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Duct cover against the wall */}
      <mesh castShadow position={[0, canopyH + 0.45, -depth / 2 + 0.1]}>
        <boxGeometry args={[0.26, 0.5, 0.16]} />
        <meshStandardMaterial {...metal} />
      </mesh>
    </group>
  );
}
