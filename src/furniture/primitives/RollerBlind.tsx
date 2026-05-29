import { readNum, readStr } from './shared';
import { getFabricMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Roller blind: a top cassette + a flat fabric panel pulled partway down,
 *  with a weighted bottom rail. A flatter, more modern window treatment than
 *  drapes. Hangs against the wall (faces +Z); `height` is the cassette height
 *  and `drop` is how far the blind is lowered. */
export function RollerBlind({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2);
  const height = readNum(props, 'height', 2.3);
  const drop = readNum(props, 'drop', 1.7);
  const color = readStr(props, 'color', '#d8d2c4');

  const fabricMat = getFabricMaterial(color);
  const cassetteY = height - 0.04;
  const fabricTop = cassetteY - 0.04;
  const fabricBottom = fabricTop - drop;
  const metal = { color: '#9a9da2', roughness: 0.4, metalness: 0.6 } as const;

  return (
    <group>
      {/* Top cassette housing the roller */}
      <mesh castShadow position={[0, cassetteY, 0.02]}>
        <boxGeometry args={[width + 0.04, 0.08, 0.1]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Fabric panel */}
      <mesh castShadow position={[0, (fabricTop + fabricBottom) / 2, 0.04]} material={fabricMat}>
        <boxGeometry args={[width, drop, 0.012]} />
      </mesh>
      {/* Weighted bottom rail */}
      <mesh castShadow position={[0, fabricBottom, 0.04]}>
        <boxGeometry args={[width + 0.02, 0.03, 0.03]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {/* Side chain */}
      <mesh position={[width / 2 + 0.03, cassetteY - 0.35, 0.04]}>
        <cylinderGeometry args={[0.004, 0.004, 0.7, 6]} />
        <meshStandardMaterial color="#b8bcc0" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}
