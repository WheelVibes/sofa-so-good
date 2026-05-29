import { readNum, readStr } from './shared';
import { applianceFinish } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/** Countertop microwave: body + glazed door + control strip. Sits at
 *  `surfaceHeight` (a counter top). Faces +Z. */
export function Microwave({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.9);
  const color = readStr(props, 'color', '#3b3e44');
  const finish = readStr(props, 'finish', 'gloss');
  const w = 0.5;
  const h = 0.3;
  const d = 0.36;
  const body = { color, ...applianceFinish(finish) };

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Glazed door window */}
      <mesh position={[-0.06, h / 2, d / 2 + 0.002]}>
        <boxGeometry args={[w * 0.55, h * 0.7, 0.01]} />
        <meshStandardMaterial color="#15171b" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Control strip */}
      <mesh position={[w / 2 - 0.07, h / 2, d / 2 + 0.002]}>
        <boxGeometry args={[0.1, h * 0.8, 0.01]} />
        <meshStandardMaterial color="#23262b" roughness={0.5} />
      </mesh>
      {/* Handle */}
      <mesh castShadow position={[0.16, h / 2, d / 2 + 0.02]}>
        <boxGeometry args={[0.02, h * 0.7, 0.02]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}
