import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Small round side / end table — a round top on three splayed legs. Sits
 *  beside a sofa, armchair, or bed for a lamp, drink, or plant. Faces +Z. */
export function SideTable({ props }: { props: ParamProps }) {
  const diameter = readNum(props, 'diameter', 0.45);
  const totalH = readNum(props, 'height', 0.5);
  const topColor = readStr(props, 'topColor', '#9e7b53');
  const legColor = readStr(props, 'legColor', '#4a3722');

  const r = diameter / 2;
  const topThk = 0.035;
  const legR = 0.018;
  const topMat = getWoodMaterial(topColor, 0.8);
  const legH = totalH - topThk;
  const splay = r * 0.62;

  return (
    <group>
      {/* Round top */}
      <mesh castShadow receiveShadow position={[0, totalH - topThk / 2, 0]} material={topMat}>
        <cylinderGeometry args={[r, r, topThk, 28]} />
      </mesh>
      {/* Three splayed legs */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const tx = Math.sin(a) * (r - 0.05);
        const tz = Math.cos(a) * (r - 0.05);
        const bx = Math.sin(a) * splay;
        const bz = Math.cos(a) * splay;
        const mx = (tx + bx) / 2;
        const mz = (tz + bz) / 2;
        const lean = Math.atan2(Math.hypot(bx - tx, bz - tz), legH);
        return (
          <mesh
            key={i}
            castShadow
            position={[mx, legH / 2, mz]}
            rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
          >
            <cylinderGeometry args={[legR, legR * 0.7, legH, 8]} />
            <meshStandardMaterial color={legColor} roughness={0.5} metalness={0.1} />
          </mesh>
        );
      })}
    </group>
  );
}
