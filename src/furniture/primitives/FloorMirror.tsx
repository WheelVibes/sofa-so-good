import { readNum, readStr } from './shared';
import type { ParamProps } from '../types';

/**
 * Leaning full-length floor mirror: a tall framed reflective panel that
 * stands on the floor and tilts back slightly against the wall behind it.
 * Faces +Z. The pane uses the same tier-robust reflective treatment as the
 * wall mirror (light base + faint emissive floor so it never goes black on
 * the Low tier, boosted envMapIntensity to catch the IBL where it's on).
 */
export function FloorMirror({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.6);
  const height = readNum(props, 'height', 1.6);
  const frameColor = readStr(props, 'frameColor', '#6f553f');

  const lean = 0.12; // radians, top tilts back toward the wall
  const frameD = 0.05;

  return (
    // Pivot at the floor so the lean rotates about the base.
    <group rotation={[lean, 0, 0]}>
      <group position={[0, height / 2, 0]}>
        {/* Frame */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[width + 0.06, height + 0.06, frameD]} />
          <meshStandardMaterial color={frameColor} roughness={0.5} metalness={0.2} />
        </mesh>
        {/* Reflective pane, slightly proud of the frame face */}
        <mesh position={[0, 0, frameD / 2 + 0.005]}>
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
    </group>
  );
}
