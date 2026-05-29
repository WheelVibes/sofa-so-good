import { readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Counter-height bar stool: round seat, footrest ring, four splayed legs. */
export function BarStool({ props }: { props: ParamProps }) {
  const seatColor = readStr(props, 'seatColor', '#7a5c3c');
  const legColor = readStr(props, 'legColor', '#3a3d42');
  const seatH = 0.66;
  const r = 0.18;

  return (
    <group>
      {/* Seat */}
      <mesh castShadow position={[0, seatH, 0]} material={getWoodMaterial(seatColor, 0.5)}>
        <cylinderGeometry args={[r, r, 0.05, 24]} />
      </mesh>
      {/* Legs (splayed) */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const tx = Math.sin(a) * (r - 0.03);
        const tz = Math.cos(a) * (r - 0.03);
        const bx = Math.sin(a) * (r + 0.06);
        const bz = Math.cos(a) * (r + 0.06);
        const mx = (tx + bx) / 2;
        const mz = (tz + bz) / 2;
        const lean = Math.atan2(Math.hypot(bx - tx, bz - tz), seatH);
        return (
          <mesh
            key={i}
            castShadow
            position={[mx, seatH / 2, mz]}
            rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
          >
            <cylinderGeometry args={[0.014, 0.014, seatH, 8]} />
            <meshStandardMaterial color={legColor} roughness={0.4} metalness={0.6} />
          </mesh>
        );
      })}
      {/* Footrest ring */}
      <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r + 0.02, 0.012, 8, 24]} />
        <meshStandardMaterial color={legColor} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}
