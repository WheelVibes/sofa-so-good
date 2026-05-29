import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getWoodMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface BedProps {
  props: ParamProps;
}

/**
 * Bed primitive: frame + mattress + duvet + pillows + headboard.
 * Origin sits on the floor at the centre of the footprint; the bed
 * extends in +X (width) and +Z (length), headboard at the -Z end.
 */
export function Bed({ props }: BedProps) {
  const width = readNum(props, 'width', 1.4);
  const length = readNum(props, 'length', 2.0);
  const mattressColor = readStr(props, 'mattressColor', '#e8e2d4');
  const beddingColor = readStr(props, 'beddingColor', '#c9d3da');
  const throwColor = readStr(props, 'throwColor', '#b08968');
  const frameColor = readStr(props, 'frameColor', '#6f553f');
  const headboardStyle = readStr(props, 'headboardStyle', 'flat');

  const frameH = 0.30;
  const mattressH = 0.22;
  const headboardH = headboardStyle === 'paneled' ? 0.95 : 0.7;
  const headboardThickness = 0.06;
  const mattressTop = frameH + mattressH;

  const frameMat = getWoodMaterial(frameColor, 2);
  const fabric = { roughness: 0.92, metalness: 0 };
  // Pillows: two for anything queen-width or wider, otherwise one.
  const twoPillows = width >= 1.3;
  const pillowW = twoPillows ? width * 0.4 : width * 0.6;
  const pillowZ = -length / 2 + 0.32;

  return (
    <group>
      {/* Frame */}
      <mesh castShadow receiveShadow position={[0, frameH / 2, 0]} material={frameMat}>
        <boxGeometry args={[width, frameH, length]} />
      </mesh>
      {/* Mattress */}
      <mesh castShadow receiveShadow position={[0, frameH + mattressH / 2, 0]}>
        <boxGeometry args={[width - 0.06, mattressH, length - 0.06]} />
        <meshStandardMaterial color={mattressColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Duvet — covers the foot ~62% of the bed, sits slightly proud. */}
      <RoundedBox args={[width - 0.02, 0.09, length * 0.64]} radius={0.04} smoothness={2} castShadow receiveShadow position={[0, mattressTop + 0.04, length * 0.18]}>
        <meshStandardMaterial color={beddingColor} {...fabric} />
      </RoundedBox>
      {/* Folded top edge of the duvet */}
      <RoundedBox args={[width - 0.02, 0.05, 0.12]} radius={0.025} smoothness={2} castShadow position={[0, mattressTop + 0.06, -length * 0.14]}>
        <meshStandardMaterial color={beddingColor} {...fabric} />
      </RoundedBox>
      {/* Pillows */}
      {(twoPillows ? [-1, 1] : [0]).map((s) => (
        <RoundedBox
          key={s}
          args={[pillowW, 0.13, 0.34]}
          radius={0.06}
          smoothness={2}
          castShadow
          position={[twoPillows ? s * (pillowW / 2 + 0.04) : 0, mattressTop + 0.07, pillowZ]}
        >
          <meshStandardMaterial color="#fbfaf6" roughness={0.95} metalness={0} />
        </RoundedBox>
      ))}
      {/* Folded throw blanket draped across the foot */}
      <mesh castShadow receiveShadow position={[0, mattressTop + 0.05, length * 0.32]}>
        <boxGeometry args={[width - 0.04, 0.07, length * 0.22]} />
        <meshStandardMaterial color={throwColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Headboard at -Z end */}
      <mesh castShadow position={[0, headboardH / 2, -length / 2 + headboardThickness / 2]} material={frameMat}>
        <boxGeometry args={[width + 0.04, headboardH, headboardThickness]} />
      </mesh>
    </group>
  );
}
