import type { ReactNode } from 'react';
import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Open cube-shelf room divider (KALLAX-style) — a freestanding grid of
 * open cubbies with no back panel, so it reads through both sides. Common
 * in open-concept HDB flats to zone living from dining. A few cubbies carry
 * decorative books/boxes. Faces +Z.
 */
export function CubeShelf({ props }: { props: ParamProps }) {
  const cols = Math.max(1, Math.min(5, Math.round(readNum(props, 'cols', 3))));
  const rows = Math.max(1, Math.min(4, Math.round(readNum(props, 'rows', 2))));
  const color = readStr(props, 'color', '#caa478');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);

  const cube = 0.38; // interior cube size
  const t = 0.03; // panel thickness
  const depth = 0.34;
  const width = cols * cube + (cols + 1) * t;
  const height = rows * cube + (rows + 1) * t;
  const wood = getSurfaceMaterial(finish, color, 1.4, sheen);
  const BOX_COLORS = ['#7d3b3b', '#3b5a7d', '#5a7d3b', '#b08a3e', '#6b4a7d'];

  const verticals = Array.from({ length: cols + 1 }, (_, i) => {
    const x = -width / 2 + t / 2 + i * (cube + t);
    return (
      <mesh key={`v${i}`} castShadow receiveShadow position={[x, height / 2, 0]} material={wood}>
        <boxGeometry args={[t, height, depth]} />
      </mesh>
    );
  });
  const horizontals = Array.from({ length: rows + 1 }, (_, i) => {
    const y = t / 2 + i * (cube + t);
    return (
      <mesh key={`h${i}`} castShadow receiveShadow position={[0, y, 0]} material={wood}>
        <boxGeometry args={[width, t, depth]} />
      </mesh>
    );
  });

  // Sparse decorative fills (deterministic).
  const fills: ReactNode[] = [];
  let seed = cols * 131 + rows * 17;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() > 0.5) continue;
      const cx = -width / 2 + t + cube / 2 + c * (cube + t);
      const cy = t + cube / 2 + r * (cube + t);
      if (rnd() > 0.5) {
        // a small stack of books leaning
        fills.push(
          <mesh key={`b${r}-${c}`} castShadow position={[cx, t + r * (cube + t) + 0.11, 0.02]}>
            <boxGeometry args={[cube * 0.6, 0.22, depth * 0.6]} />
            <meshStandardMaterial color={BOX_COLORS[Math.floor(rnd() * BOX_COLORS.length)]} roughness={0.8} />
          </mesh>,
        );
      } else {
        // a storage box
        fills.push(
          <mesh key={`x${r}-${c}`} castShadow position={[cx, cy, 0]} material={wood}>
            <boxGeometry args={[cube * 0.9, cube * 0.88, depth * 0.86]} />
          </mesh>,
        );
      }
    }
  }

  return (
    <group>
      {verticals}
      {horizontals}
      {fills}
    </group>
  );
}
