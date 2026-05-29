import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/** Wall mirror: thin frame + a low-roughness reflective-looking pane.
 *  Mounted on a wall (group offset up); faces +Z. */
export function Mirror({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6);
  const height = readNum(props, 'height', 0.9);
  const centerY = readNum(props, 'mountHeight', 1.5);
  const frameColor = readStr(props, 'frameColor', '#c9ccd1');

  return (
    <group position={[0, centerY, 0]}>
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[width + 0.04, height + 0.04, 0.03]} />
        <meshStandardMaterial color={frameColor} roughness={0.35} metalness={0.6} />
      </mesh>
      {/* Reflective pane — low roughness + metalness picks up the IBL so it
          reads as a mirror without a real reflection probe. A light base
          colour plus a faint emissive floor keeps it from going black on the
          Low tier (where IBL is disabled and a pure metal has nothing to
          reflect); the boosted envMapIntensity makes it bright where IBL is on. */}
      <mesh position={[0, 0, 0.018]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#dfe8ee"
          roughness={0.07}
          metalness={0.7}
          envMapIntensity={2.0}
          emissive="#b9c6d0"
          emissiveIntensity={0.16}
        />
      </mesh>
    </group>
  );
}
