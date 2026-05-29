import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Single-over-single bunk bed: four posts, two mattress platforms, an end
 *  ladder, and an upper-bunk guardrail. Faces +Z; single-mattress footprint
 *  (~0.95 × 1.95 m). Frame finish is configurable (wood/painted/gloss). */
export function BunkBed({ props }: { props: ParamProps }) {
  const frameColor = readStr(props, 'frameColor', '#b8895a');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const lowerBed = readStr(props, 'lowerBedding', '#c9d3da');
  const upperBed = readStr(props, 'upperBedding', '#d9c3b0');

  const W = 0.95;
  const L = 1.95;
  const postR = 0.035;
  const postH = 1.62;
  const lowerY = 0.32;
  const upperY = 1.18;
  const mattT = 0.14;
  const frame = getSurfaceMaterial(finish, frameColor, 1.4, sheen);
  const matFab = (c: string) => ({ color: c, roughness: 0.92, metalness: 0 });

  const px = W / 2 - postR;
  const pz = L / 2 - postR;
  const posts: [number, number][] = [
    [-px, -pz], [px, -pz], [-px, pz], [px, pz],
  ];

  function Platform({ y, color }: { y: number; color: string }) {
    return (
      <group>
        {/* Slat base */}
        <mesh castShadow receiveShadow position={[0, y, 0]} material={frame}>
          <boxGeometry args={[W - postR, 0.05, L - postR]} />
        </mesh>
        {/* Mattress */}
        <mesh castShadow receiveShadow position={[0, y + 0.03 + mattT / 2, 0]}>
          <boxGeometry args={[W - 0.1, mattT, L - 0.1]} />
          <meshStandardMaterial {...matFab(color)} />
        </mesh>
        {/* Pillow */}
        <mesh castShadow position={[0, y + 0.03 + mattT + 0.04, -L / 2 + 0.28]}>
          <boxGeometry args={[W - 0.28, 0.1, 0.34]} />
          <meshStandardMaterial {...matFab('#ece5da')} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      {/* Posts */}
      {posts.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, postH / 2, z]} material={frame}>
          <cylinderGeometry args={[postR, postR, postH, 12]} />
        </mesh>
      ))}
      {/* Side rails at both levels (long sides) */}
      {[lowerY, upperY].map((y) =>
        [-1, 1].map((sx) => (
          <mesh key={`${y}.${sx}`} castShadow position={[sx * (W / 2 - postR), y, 0]} material={frame}>
            <boxGeometry args={[0.04, 0.08, L - postR]} />
          </mesh>
        )),
      )}
      <Platform y={lowerY} color={lowerBed} />
      <Platform y={upperY} color={upperBed} />
      {/* Upper-bunk guardrail on the +X side, spanning the head half */}
      <mesh castShadow position={[W / 2 - postR, upperY + 0.28, -L / 4]} material={frame}>
        <boxGeometry args={[0.04, 0.04, L / 2]} />
      </mesh>
      {[-L / 2 + 0.1, 0].map((z, i) => (
        <mesh key={`gr${i}`} castShadow position={[W / 2 - postR, upperY + 0.16, z]} material={frame}>
          <cylinderGeometry args={[0.012, 0.012, 0.28, 8]} />
        </mesh>
      ))}
      {/* Ladder at the foot (+Z) end, on the +X side */}
      <group position={[W / 2 - postR - 0.02, 0, L / 2 - 0.08]}>
        {[-1, 1].map((sx) => (
          <mesh key={sx} castShadow position={[sx * 0.13, (upperY + 0.1) / 2, 0]} material={frame}>
            <boxGeometry args={[0.03, upperY + 0.1, 0.03]} />
          </mesh>
        ))}
        {[0.28, 0.56, 0.84, 1.12].map((y, i) => (
          <mesh key={`rung${i}`} castShadow position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]} material={frame}>
            <cylinderGeometry args={[0.014, 0.014, 0.26, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
