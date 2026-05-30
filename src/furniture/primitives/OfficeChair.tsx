import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getUpholsteryMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Office chair on a 5-star castor base + gas lift. Styles: 'task' (padded
 *  seat + curved back), 'executive' (taller padded back + headrest), and
 *  'mesh' (a slim mesh-panel back). Faces +Z. */
export function OfficeChair({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#2b2f33');
  const material = readStr(props, 'material', 'fabric');
  const sheen = readNum(props, 'sheen', 0);
  const pattern = readStr(props, 'pattern', 'plain');
  const style = readStr(props, 'style', 'task');

  const seatH = 0.48;
  const seatW = 0.46;
  const seatD = 0.46;
  const mat = getUpholsteryMaterial(material, color, sheen, pattern);
  const plastic = { color: '#1d1f22', roughness: 0.5, metalness: 0.2 };
  const meshMat = { color, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.82 };

  const backH = style === 'executive' ? 0.62 : 0.5;
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
      {/* Seat (contoured padded cushion) */}
      <RoundedBox args={[seatW, 0.11, seatD]} radius={0.03} smoothness={3} castShadow position={[0, seatH, 0]} material={mat} />

      {/* Back — mesh panel, or padded (task/executive) with a slight recline */}
      <group position={[0, seatH + 0.08, -seatD / 2 + 0.05]} rotation={[0.08, 0, 0]}>
        {style === 'mesh' ? (
          <>
            {/* Slim frame + translucent mesh panel */}
            <mesh castShadow position={[0, backH / 2, 0]}>
              <boxGeometry args={[seatW - 0.02, backH, 0.012]} />
              <meshStandardMaterial {...meshMat} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} castShadow position={[s * (seatW / 2 - 0.02), backH / 2, 0]}>
                <boxGeometry args={[0.025, backH, 0.03]} />
                <meshStandardMaterial {...plastic} />
              </mesh>
            ))}
            {/* Lumbar support bar */}
            <mesh castShadow position={[0, backH * 0.32, 0.02]}>
              <boxGeometry args={[seatW - 0.06, 0.05, 0.02]} />
              <meshStandardMaterial {...plastic} />
            </mesh>
          </>
        ) : (
          <RoundedBox args={[seatW - 0.02, backH, 0.08]} radius={0.04} smoothness={3} castShadow position={[0, backH / 2, 0]} material={mat} />
        )}
        {/* Executive headrest */}
        {style === 'executive' && (
          <RoundedBox args={[seatW - 0.12, 0.16, 0.07]} radius={0.04} smoothness={3} castShadow position={[0, backH + 0.06, 0]} material={mat} />
        )}
      </group>

      {/* Armrests (padded tops) */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh castShadow position={[s * (seatW / 2 + 0.005), seatH + 0.02, 0.02]}>
            <boxGeometry args={[0.03, 0.16, 0.03]} />
            <meshStandardMaterial {...plastic} />
          </mesh>
          <RoundedBox args={[0.06, 0.03, 0.22]} radius={0.012} smoothness={2} castShadow position={[s * (seatW / 2 + 0.005), seatH + 0.12, 0.02]}>
            <meshStandardMaterial {...plastic} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}
