import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Standing coat / hat rack — a central pole on splayed feet with a ring of
 * hooks near the top (and a couple of upper pegs). An entryway staple.
 * `style` is a wood tree or a slim metal stand. Floor-anchored, centred.
 */
export function CoatRack({ props }: { props: ParamProps }) {
  const height = readNum(props, 'height', 1.75);
  const color = readStr(props, 'color', '#6f553f');
  const style = readStr(props, 'style', 'wood');
  const sheen = readNum(props, 'sheen', 0.2);

  const poleMat =
    style === 'metal'
      ? { color, roughness: 0.35, metalness: 0.8 }
      : getSurfaceMaterial('wood', color, 0.6, sheen);
  const poleR = style === 'metal' ? 0.018 : 0.028;
  const hookMat = style === 'metal' ? { color, roughness: 0.35, metalness: 0.8 } : getSurfaceMaterial('wood', color, 0.6, sheen);

  // Hooks at two heights for coats + hats.
  const tiers = [
    { y: height - 0.05, n: 4, len: 0.12, tilt: 0.5 },
    { y: height - 0.28, n: 4, len: 0.14, tilt: 0.7 },
  ];

  return (
    <group>
      {/* Central pole */}
      <mesh castShadow position={[0, height / 2, 0]} material={poleMat as never}>
        <cylinderGeometry args={[poleR, poleR * 1.2, height, 12]} />
      </mesh>
      {/* Top knob */}
      <mesh castShadow position={[0, height + 0.02, 0]} material={poleMat as never}>
        <sphereGeometry args={[poleR * 1.6, 12, 10]} />
      </mesh>
      {/* Three splayed feet */}
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.cos(a) * 0.14, 0.03, Math.sin(a) * 0.14]}
            rotation={[Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5]}
            material={poleMat as never}
          >
            <cylinderGeometry args={[0.018, 0.014, 0.32, 8]} />
          </mesh>
        );
      })}
      {/* Hooks */}
      {tiers.flatMap((t, ti) =>
        Array.from({ length: t.n }, (_, i) => {
          const a = (i / t.n) * Math.PI * 2 + (ti === 0 ? 0 : Math.PI / t.n);
          return (
            <mesh
              key={`${ti}.${i}`}
              castShadow
              position={[Math.cos(a) * 0.04, t.y, Math.sin(a) * 0.04]}
              rotation={[Math.sin(a) * t.tilt, -a, Math.cos(a) * t.tilt]}
              material={hookMat as never}
            >
              <cylinderGeometry args={[0.01, 0.008, t.len, 8]} />
            </mesh>
          );
        }),
      )}
    </group>
  );
}
