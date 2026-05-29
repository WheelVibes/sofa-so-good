import { readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Office task chair: 5-star castor base + gas lift + seat + curved back.
 *  Faces +Z. */
export function OfficeChair({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#2b2f33');
  const seatH = 0.48;
  const seatW = 0.46;
  const seatD = 0.46;
  const fabricMat = getFabricMaterial(color);
  const plastic = { color: '#1d1f22', roughness: 0.5, metalness: 0.2 };

  const legs = 5;
  return (
    <group>
      {/* Castor legs */}
      {Array.from({ length: legs }, (_, i) => {
        const a = (i / legs) * Math.PI * 2;
        const lx = Math.sin(a) * 0.26;
        const lz = Math.cos(a) * 0.26;
        return (
          <group key={i}>
            <mesh castShadow position={[lx / 2, 0.05, lz / 2]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.04, 0.03, 0.28]} />
              <meshStandardMaterial {...plastic} />
            </mesh>
            <mesh castShadow position={[lx, 0.025, lz]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.05, 10]} />
              <meshStandardMaterial color="#0e0f10" roughness={0.4} />
            </mesh>
          </group>
        );
      })}
      {/* Gas lift */}
      <mesh castShadow position={[0, seatH - 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.03, seatH - 0.2, 12]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Seat */}
      <mesh castShadow position={[0, seatH, 0]} material={fabricMat}>
        <boxGeometry args={[seatW, 0.1, seatD]} />
      </mesh>
      {/* Back */}
      <mesh castShadow position={[0, seatH + 0.32, -seatD / 2 + 0.04]} material={fabricMat}>
        <boxGeometry args={[seatW - 0.04, 0.5, 0.06]} />
      </mesh>
      {/* Armrests */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * (seatW / 2 - 0.01), seatH + 0.16, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.3]} />
          <meshStandardMaterial {...plastic} />
        </mesh>
      ))}
    </group>
  );
}
