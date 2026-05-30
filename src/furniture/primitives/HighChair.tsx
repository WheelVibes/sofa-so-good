import { RoundedBox } from '@react-three/drei';
import { readNum, readStr } from './shared';
import { getSurfaceMaterial, getUpholsteryMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Baby high chair — a tall seat with a back, a front tray and a footrest, on
 * four splayed legs. `style` is a wood Scandi frame or a moulded plastic seat.
 * Floor-anchored, centred, faces +Z (tray at the front).
 */
export function HighChair({ props }: { props: ParamProps }) {
  const frameColor = readStr(props, 'frameColor', '#caa46a');
  const seatColor = readStr(props, 'seatColor', '#e7e2d6');
  const style = readStr(props, 'style', 'wood');
  const sheen = readNum(props, 'sheen', 0.1);

  const seatY = 0.5;
  const seatW = 0.34;
  const seatD = 0.3;
  const legMat = getSurfaceMaterial(style === 'plastic' ? 'gloss' : 'wood', frameColor, 0.8, sheen);
  const seatMat = getUpholsteryMaterial('fabric', seatColor, sheen);
  const tray = getSurfaceMaterial('gloss', seatColor, 0.6, 0.3);

  const lx = seatW / 2 + 0.02;
  const lz = seatD / 2 + 0.02;
  const legSplay = 0.12;

  return (
    <group>
      {/* Four splayed legs */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}.${sz}`}
            castShadow
            position={[sx * lx, seatY / 2, sz * lz]}
            rotation={[sz * legSplay, 0, -sx * legSplay]}
            material={legMat}
          >
            <cylinderGeometry args={[0.016, 0.012, seatY, 10]} />
          </mesh>
        )),
      )}
      {/* Footrest bar */}
      <mesh castShadow position={[0, 0.22, lz + 0.04]} rotation={[0, 0, Math.PI / 2]} material={legMat}>
        <cylinderGeometry args={[0.012, 0.012, seatW + 0.08, 8]} />
      </mesh>
      {/* Seat */}
      <RoundedBox args={[seatW, 0.06, seatD]} radius={0.02} smoothness={2} castShadow position={[0, seatY, 0]} material={seatMat} />
      {/* Backrest */}
      <RoundedBox args={[seatW, 0.34, 0.05]} radius={0.02} smoothness={2} castShadow position={[0, seatY + 0.2, -seatD / 2 + 0.02]} material={seatMat} />
      {/* Front tray */}
      <RoundedBox args={[seatW + 0.12, 0.03, 0.22]} radius={0.02} smoothness={2} castShadow position={[0, seatY + 0.12, seatD / 2 + 0.04]} material={tray} />
    </group>
  );
}
