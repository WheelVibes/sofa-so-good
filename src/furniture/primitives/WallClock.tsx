import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Round wall clock — rim + face + hour/minute hands, mounted flat on a wall
 *  (group offset to the hang height); faces +Z. Hands are posed at a fixed
 *  pleasant time (10:10). */
export function WallClock({ props }: { props: ParamProps }) {
  const diameter = readNum(props, 'diameter', 0.32);
  const centerY = readNum(props, 'mountHeight', 1.6);
  const frameColor = readStr(props, 'frameColor', '#2a2722');
  const faceColor = readStr(props, 'faceColor', '#f4f1ea');

  const r = diameter / 2;
  const handMat = { color: '#23262b', roughness: 0.5, metalness: 0.2 } as const;

  return (
    <group position={[0, centerY, 0]} rotation={[Math.PI / 2, 0, 0]}>
      {/* Rim */}
      <mesh castShadow>
        <cylinderGeometry args={[r, r, 0.035, 32]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Face, slightly proud of the rim front (+Z in world → +Y local here) */}
      <mesh position={[0, 0.019, 0]}>
        <cylinderGeometry args={[r - 0.015, r - 0.015, 0.005, 32]} />
        <meshStandardMaterial color={faceColor} roughness={0.8} />
      </mesh>
      {/* Hour markers at 12/3/6/9 */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.sin(a) * (r - 0.04), 0.022, Math.cos(a) * (r - 0.04)]}>
            <boxGeometry args={[0.012, 0.004, 0.03]} />
            <meshStandardMaterial color="#23262b" roughness={0.6} />
          </mesh>
        );
      })}
      {/* Hour hand (points to ~10) and minute hand (points to ~2): 10:10.
          Each hand is anchored at the centre and extends outward. */}
      <group rotation={[0, -Math.PI / 3, 0]}>
        <mesh position={[0, 0.024, (r * 0.5) / 2]}>
          <boxGeometry args={[0.012, 0.004, r * 0.5]} />
          <meshStandardMaterial {...handMat} />
        </mesh>
      </group>
      <group rotation={[0, Math.PI / 3, 0]}>
        <mesh position={[0, 0.025, (r * 0.72) / 2]}>
          <boxGeometry args={[0.009, 0.004, r * 0.72]} />
          <meshStandardMaterial {...handMat} />
        </mesh>
      </group>
      {/* Centre cap */}
      <mesh position={[0, 0.027, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.01, 12]} />
        <meshStandardMaterial color="#23262b" roughness={0.4} metalness={0.4} />
      </mesh>
    </group>
  );
}
