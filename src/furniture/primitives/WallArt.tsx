import { readNum, readStr } from './shared';
import { getGradientMaterial, getPrintMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Framed wall art / picture. Mounted on a wall (group offset up to the
 *  hanging height); faces +Z so it sits flat against a wall behind it.
 *  `pattern: 'gradient'` blends the print from `artColor` to `artColor2`.
 *  `frameStyle` picks a thin frame, a wide gallery frame, a deep box float
 *  frame, or a frameless canvas. */
export function WallArt({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.8);
  const height = readNum(props, 'height', 0.6);
  const centerY = readNum(props, 'mountHeight', 1.55);
  const frameColor = readStr(props, 'frameColor', '#2c2722');
  const artColor = readStr(props, 'artColor', '#9fb0a6');
  const artColor2 = readStr(props, 'artColor2', '#d8c7a0');
  const pattern = readStr(props, 'pattern', 'solid');
  const frameStyle = readStr(props, 'frameStyle', 'thin');

  const frameW = frameStyle === 'gallery' ? 0.1 : frameStyle === 'box' ? 0.05 : 0.04;
  const frameDepth = frameStyle === 'box' ? 0.07 : 0.03;
  const showFrame = frameStyle !== 'none';
  const showMat = frameStyle === 'thin' || frameStyle === 'gallery';
  const printKinds = ['stripes', 'blocks', 'chevron'];
  const gradientMat =
    pattern === 'gradient'
      ? getGradientMaterial(artColor, artColor2)
      : printKinds.includes(pattern)
        ? getPrintMaterial(artColor, artColor2, pattern)
        : null;
  // The print sits just proud of the frame face (or its own slab when frameless).
  const artZ = showFrame ? frameDepth / 2 + 0.003 : 0.008;
  const artInset = showFrame ? frameW * 2 : 0;

  return (
    <group position={[0, centerY, 0]}>
      {/* Frame */}
      {showFrame && (
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[width, height, frameDepth]} />
          <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.1} />
        </mesh>
      )}
      {/* Mat border highlight (only on framed + matted styles) */}
      {showMat && (
        <mesh position={[0, 0, frameDepth / 2 + 0.001]}>
          <planeGeometry args={[width - frameW, height - frameW]} />
          <meshStandardMaterial color="#f3f1ea" roughness={0.9} />
        </mesh>
      )}
      {/* Canvas / print */}
      <mesh position={[0, 0, artZ]} material={gradientMat ?? undefined}>
        <planeGeometry args={[width - artInset, height - artInset]} />
        {gradientMat ? null : <meshStandardMaterial color={artColor} roughness={0.85} metalness={0} />}
      </mesh>
      {/* Frameless canvas gets a thin edge slab so it reads as a wrapped print */}
      {!showFrame && (
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[width, height, 0.016]} />
          <meshStandardMaterial color={artColor} roughness={0.85} metalness={0} />
        </mesh>
      )}
    </group>
  );
}
