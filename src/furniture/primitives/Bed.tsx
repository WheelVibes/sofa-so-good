import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface BedProps {
  props: ParamProps;
}

/**
 * Bed primitive: frame box, mattress box, headboard plate.
 * Origin sits on the floor at the centre of the footprint; the bed
 * extends in +X (width) and +Z (length).
 */
export function Bed({ props }: BedProps) {
  const width = readNum(props, 'width', 1.4);
  const length = readNum(props, 'length', 2.0);
  const mattressColor = readStr(props, 'mattressColor', '#e8e2d4');
  const frameColor = readStr(props, 'frameColor', '#6f553f');
  const headboardStyle = readStr(props, 'headboardStyle', 'flat');

  const frameH = 0.30;
  const mattressH = 0.22;
  const headboardH = headboardStyle === 'paneled' ? 0.95 : 0.7;
  const headboardThickness = 0.06;

  return (
    <group>
      {/* Frame */}
      <mesh castShadow receiveShadow position={[0, frameH / 2, 0]}>
        <boxGeometry args={[width, frameH, length]} />
        <meshStandardMaterial color={frameColor} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
      {/* Mattress */}
      <mesh
        castShadow
        receiveShadow
        position={[0, frameH + mattressH / 2, 0]}
      >
        <boxGeometry args={[width - 0.06, mattressH, length - 0.06]} />
        <meshStandardMaterial color={mattressColor} roughness={0.9} metalness={0} />
      </mesh>
      {/* Headboard at -Z end */}
      <mesh
        castShadow
        receiveShadow
        position={[0, headboardH / 2, -length / 2 + headboardThickness / 2]}
      >
        <boxGeometry args={[width + 0.04, headboardH, headboardThickness]} />
        <meshStandardMaterial color={frameColor} roughness={STYLISED_ROUGHNESS} metalness={STYLISED_METALNESS} />
      </mesh>
    </group>
  );
}
