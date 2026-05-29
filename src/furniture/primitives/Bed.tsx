import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
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
  const frameFinish = readStr(props, 'frameFinish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const headboardStyle = readStr(props, 'headboardStyle', 'flat');
  const baseStyle = readStr(props, 'baseStyle', 'standard');

  const frameH = 0.28;
  const mattressH = 0.27; // 10–11" mattress, grounded in real dimensions
  const upholstered = headboardStyle === 'upholstered';
  const headboardH = upholstered ? 1.05 : headboardStyle === 'paneled' ? 0.98 : 0.72;
  const headboardThickness = upholstered ? 0.12 : 0.06;
  const mattressTop = frameH + mattressH;

  const frameMat = getSurfaceMaterial(frameFinish, frameColor, 2, sheen);
  const fabric = { roughness: 0.92, metalness: 0 };
  // Pillows: two for anything queen-width or wider, otherwise one.
  const twoPillows = width >= 1.3;
  const pillowW = twoPillows ? width * 0.4 : width * 0.6;
  const pillowZ = -length / 2 + 0.32;

  return (
    <group>
      {/* Frame — 'standard' box, a 'platform' with a surrounding ledge, or a
          'storage' frame with two drawer fronts along the +X side. */}
      {baseStyle === 'platform' ? (
        <>
          {/* Wide low platform extending past the mattress as a ledge */}
          <mesh castShadow receiveShadow position={[0, frameH * 0.4, 0]} material={frameMat}>
            <boxGeometry args={[width + 0.2, frameH * 0.8, length + 0.2]} />
          </mesh>
          {/* Inset riser the mattress rests on, keeping mattress height */}
          <mesh castShadow position={[0, frameH * 0.85, 0]} material={frameMat}>
            <boxGeometry args={[width, frameH * 0.3, length]} />
          </mesh>
        </>
      ) : (
        <mesh castShadow receiveShadow position={[0, frameH / 2, 0]} material={frameMat}>
          <boxGeometry args={[width, frameH, length]} />
        </mesh>
      )}
      {/* Storage drawers along the +X long side (foot half) */}
      {baseStyle === 'storage' &&
        [0, 1].map((i) => {
          const dz = length * (i === 0 ? 0.08 : 0.3);
          const dl = length * 0.2;
          return (
            <group key={i}>
              <mesh castShadow position={[width / 2 + 0.002, frameH / 2, dz]} material={frameMat}>
                <boxGeometry args={[0.02, frameH * 0.7, dl]} />
              </mesh>
              <mesh position={[width / 2 + 0.02, frameH / 2, dz]}>
                <boxGeometry args={[0.02, 0.02, 0.12]} />
                <meshStandardMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          );
        })}
      {/* Mattress */}
      <mesh castShadow receiveShadow position={[0, frameH + mattressH / 2, 0]}>
        <boxGeometry args={[width - 0.06, mattressH, length - 0.06]} />
        <meshStandardMaterial color={mattressColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Duvet — covers the foot ~62% of the bed, sits slightly proud and
          overhangs the mattress so it reads as draped bedding. */}
      <RoundedBox args={[width + 0.08, 0.1, length * 0.64]} radius={0.04} smoothness={2} castShadow receiveShadow position={[0, mattressTop + 0.04, length * 0.18]}>
        <meshStandardMaterial color={beddingColor} {...fabric} />
      </RoundedBox>
      {/* Duvet side drape over the rails */}
      {[-1, 1].map((s) => (
        <mesh key={`dr${s}`} castShadow position={[s * (width / 2 + 0.02), mattressTop - 0.04, length * 0.18]}>
          <boxGeometry args={[0.04, 0.16, length * 0.62]} />
          <meshStandardMaterial color={beddingColor} {...fabric} />
        </mesh>
      ))}
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
      {/* Headboard at -Z end. Upholstered = padded fabric with vertical
          channel tufting; otherwise a wood/finish panel. */}
      {upholstered ? (
        <group position={[0, 0, -length / 2 + headboardThickness / 2]}>
          <RoundedBox
            args={[width + 0.06, headboardH, headboardThickness]}
            radius={0.05}
            smoothness={3}
            castShadow
            position={[0, headboardH / 2, 0]}
          >
            <meshStandardMaterial color={frameColor} roughness={0.85} metalness={0} />
          </RoundedBox>
          {/* Channel-tufting seams */}
          {(() => {
            const n = Math.max(3, Math.round((width + 0.06) / 0.26));
            return Array.from({ length: n }, (_, i) => {
            const x = -((width + 0.06) / 2) + ((i + 0.5) * (width + 0.06)) / n;
            return (
              <mesh key={i} position={[x, headboardH / 2 + 0.06, headboardThickness / 2 - 0.005]}>
                <boxGeometry args={[0.012, headboardH - 0.18, 0.01]} />
                <meshStandardMaterial color={frameColor} roughness={0.95} metalness={0} />
              </mesh>
            );
            });
          })()}
        </group>
      ) : (
        <mesh castShadow position={[0, headboardH / 2, -length / 2 + headboardThickness / 2]} material={frameMat}>
          <boxGeometry args={[width + 0.04, headboardH, headboardThickness]} />
        </mesh>
      )}
    </group>
  );
}
