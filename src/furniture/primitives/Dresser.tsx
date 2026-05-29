import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

/** Wide chest of drawers: body + a grid of drawer fronts with knobs.
 *  Faces +Z. */
export function Dresser({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.2);
  const depth = readNum(props, 'depth', 0.5);
  const rows = Math.max(2, Math.round(readNum(props, 'rows', 3)));
  const cols = Math.max(1, Math.round(readNum(props, 'cols', 2)));
  const color = readStr(props, 'color', '#8a6b48');

  const legH = 0.08;
  const bodyH = 0.85;
  const wood = { color, roughness: STYLISED_ROUGHNESS, metalness: STYLISED_METALNESS };
  const gap = 0.02;
  const dw = (width - gap * (cols + 1)) / cols;
  const dh = (bodyH - gap * (rows + 1)) / rows;

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, legH + bodyH / 2, 0]}>
        <boxGeometry args={[width, bodyH, depth]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const x = -width / 2 + gap + dw / 2 + c * (dw + gap);
          const y = legH + gap + dh / 2 + r * (dh + gap);
          return (
            <group key={`${r}.${c}`}>
              <mesh position={[x, y, depth / 2 + 0.003]}>
                <boxGeometry args={[dw, dh, 0.02]} />
                <meshStandardMaterial color={color} roughness={0.65} metalness={STYLISED_METALNESS} />
              </mesh>
              <mesh castShadow position={[x, y, depth / 2 + 0.03]}>
                <sphereGeometry args={[0.018, 12, 10]} />
                <meshStandardMaterial color="#2b2b2b" roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          );
        }),
      )}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}.${sz}`} castShadow position={[sx * (width / 2 - 0.06), legH / 2, sz * (depth / 2 - 0.06)]}>
            <boxGeometry args={[0.05, legH, 0.05]} />
            <meshStandardMaterial color="#3a2c1d" roughness={0.5} metalness={0.1} />
          </mesh>
        )),
      )}
    </group>
  );
}
