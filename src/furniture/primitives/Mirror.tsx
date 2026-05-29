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
          reads as a mirror without a real reflection probe. */}
      <mesh position={[0, 0, 0.018]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#cdd8e0" roughness={0.08} metalness={0.85} envMapIntensity={1.0} />
      </mesh>
    </group>
  );
}
