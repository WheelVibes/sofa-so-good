import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Floor vase — a tall ceramic styling accent for a corner, optionally holding
 * dried pampas / branch stems. `shape` sets the silhouette (tall taper, round
 * belly, or wide). Floor-anchored, centred. Built at real-world metres.
 */
export function FloorVase({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 0.7);
  const color = readStr(props, 'color', '#d8cfc0');
  const finish = readStr(props, 'finish', 'gloss');
  const sheen = readNum(props, 'sheen', 0.3);
  const shape = readStr(props, 'shape', 'tall');
  const stems = readStr(props, 'stems', 'pampas');
  const stemColor = readStr(props, 'stemColor', '#cdbb93');

  const mat = getSurfaceMaterial(finish, color, 1.0, sheen);
  // Body profile by shape: [bottomR, midR, topR].
  const prof: [number, number, number] =
    shape === 'round' ? [0.1, 0.2, 0.11] : shape === 'wide' ? [0.16, 0.22, 0.18] : [0.09, 0.13, 0.1];
  const [br, mr, tr] = prof;
  const h1 = height * 0.45;
  const h2 = height * 0.55;
  const stemMat = { color: stemColor, roughness: 0.9, metalness: 0 } as const;

  return (
    <group>
      {/* Lower body (bottom → belly) */}
      <mesh castShadow receiveShadow position={[0, h1 / 2, 0]} material={mat}>
        <cylinderGeometry args={[mr, br, h1, 24]} />
      </mesh>
      {/* Upper body (belly → neck) */}
      <mesh castShadow receiveShadow position={[0, h1 + h2 / 2, 0]} material={mat}>
        <cylinderGeometry args={[tr, mr, h2, 24]} />
      </mesh>

      {/* Stems */}
      {stems !== 'none' &&
        Array.from({ length: stems === 'branch' ? 5 : 9 }, (_, i) => {
          const n = stems === 'branch' ? 5 : 9;
          const a = (i / n) * Math.PI * 2;
          const lean = stems === 'branch' ? 0.22 : 0.14;
          const len = (stems === 'branch' ? 0.7 : 0.55) * (0.8 + (i % 3) * 0.12);
          return (
            <mesh
              key={i}
              castShadow
              position={[Math.cos(a) * tr * 0.5, height + len / 2 - 0.02, Math.sin(a) * tr * 0.5]}
              rotation={[Math.cos(a) * lean, 0, -Math.sin(a) * lean]}
            >
              <cylinderGeometry args={stems === 'pampas' ? [0.012, 0.004, len, 6] : [0.006, 0.004, len, 5]} />
              <meshStandardMaterial {...stemMat} />
            </mesh>
          );
        })}
    </group>
  );
}
