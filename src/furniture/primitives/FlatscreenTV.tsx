import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Free-standing flatscreen TV: thin bezelled panel on a central neck +
 *  plate foot, sized so it sits on a TV console. */
export function FlatscreenTV({ props }: { props: ParamProps }) {
  const diagIn = readNum(props, 'size', 55); // inches
  const screenColor = readStr(props, 'screenColor', '#0e1014');

  // 16:9 panel from the diagonal (inches → metres).
  const diagM = (diagIn * 0.0254);
  const w = diagM * 0.871;
  const h = diagM * 0.49;
  const standH = 0.06;
  const panelY = standH + 0.04 + h / 2;

  return (
    <group>
      {/* Foot plate */}
      <mesh castShadow receiveShadow position={[0, standH / 2, 0]}>
        <boxGeometry args={[w * 0.42, standH, 0.22]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Neck */}
      <mesh castShadow position={[0, standH + 0.04, 0]}>
        <boxGeometry args={[0.08, 0.1, 0.05]} />
        <meshStandardMaterial color="#2a2c30" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Bezel */}
      <mesh castShadow position={[0, panelY, 0]}>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color="#15171b" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Screen (very slightly emissive so it reads as a display) */}
      <mesh position={[0, panelY, 0.021]}>
        <planeGeometry args={[w - 0.03, h - 0.03]} />
        <meshStandardMaterial
          color={screenColor}
          roughness={0.18}
          metalness={0.1}
          emissive={screenColor}
          emissiveIntensity={0.12}
        />
      </mesh>
    </group>
  );
}
