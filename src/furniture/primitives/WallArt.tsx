import { readNum, readStr } from './shared';
import { getGradientMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Framed wall art / picture. Mounted on a wall (group offset up to the
 *  hanging height); faces +Z so it sits flat against a wall behind it.
 *  `pattern: 'gradient'` blends the print from `artColor` to `artColor2`. */
export function WallArt({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8);
  const height = readNum(props, 'height', 0.6);
  const centerY = readNum(props, 'mountHeight', 1.55);
  const frameColor = readStr(props, 'frameColor', '#2c2722');
  const artColor = readStr(props, 'artColor', '#9fb0a6');
  const artColor2 = readStr(props, 'artColor2', '#d8c7a0');
  const pattern = readStr(props, 'pattern', 'solid');
  const frameW = 0.04;
  const gradientMat = pattern === 'gradient' ? getGradientMaterial(artColor, artColor2) : null;

  return (
    <group position={[0, centerY, 0]}>
      {/* Frame */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[width, height, 0.03]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Canvas / print, slightly proud of the frame face */}
      <mesh position={[0, 0, 0.018]} material={gradientMat ?? undefined}>
        <planeGeometry args={[width - frameW * 2, height - frameW * 2]} />
        {gradientMat ? null : (
          <meshStandardMaterial color={artColor} roughness={0.85} metalness={0} />
        )}
      </mesh>
      {/* Mat border highlight */}
      <mesh position={[0, 0, 0.016]}>
        <planeGeometry args={[width - frameW, height - frameW]} />
        <meshStandardMaterial color="#f3f1ea" roughness={0.9} />
      </mesh>
    </group>
  );
}
