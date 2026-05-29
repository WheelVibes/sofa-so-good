import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

interface BookshelfProps {
  props: ParamProps;
}

/**
 * Bookshelf primitive: a recessed plinth + back panel + two side panels +
 * N evenly-spaced horizontal shelves. The opening faces +Z. With
 * `style: 'cabinet'` the lowest compartment is closed by two doors with
 * handles (BILLY + OXBERG-style), and books are skipped there.
 */
export function Bookshelf({ props }: BookshelfProps) {
  const width = readNum(props, 'width', 0.9);
  const height = readNum(props, 'height', 1.8);
  const shelfCount = Math.max(2, Math.min(6, Math.round(readNum(props, 'shelfCount', 4))));
  const color = readStr(props, 'color', '#7a5e3a');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const style = readStr(props, 'style', 'open');
  const hasCabinet = style === 'cabinet';

  const depth = 0.3;
  const sideThickness = 0.025;
  const backThickness = 0.012;
  const shelfThickness = 0.022;
  const plinthH = 0.06; // recessed toe-kick the carcass stands on

  const wood = getSurfaceMaterial(finish, color, 1.4, sheen);
  // The carcass (everything below) is lifted onto the plinth.
  const carcassH = height - plinthH;
  const innerH = carcassH - shelfThickness;
  const shelfSpacing = innerH / (shelfCount - 1);
  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    const y = shelfThickness / 2 + i * shelfSpacing;
    return (
      <mesh key={i} castShadow receiveShadow position={[0, y, 0]} material={wood}>
        <boxGeometry args={[width - sideThickness * 2, shelfThickness, depth - backThickness]} />
      </mesh>
    );
  });

  // Decorative books standing on each shelf (deterministic per slot so they
  // don't reshuffle every render). When the base is a cabinet, the lowest
  // compartment (s === 0) is closed, so skip its books.
  const BOOK_COLORS = ['#7d3b3b', '#3b5a7d', '#5a7d3b', '#b08a3e', '#6b4a7d', '#3b6f6b', '#9c5a3c'];
  const usableW = width - sideThickness * 2 - 0.02;
  const books: JSX.Element[] = [];
  let bookKey = 0;
  const firstBookShelf = hasCabinet ? 1 : 0;
  for (let s = firstBookShelf; s < shelfCount - 1; s++) {
    const baseY = shelfThickness + s * shelfSpacing; // top of this shelf
    const gapH = shelfSpacing - shelfThickness;
    let x = -usableW / 2 + 0.01;
    // Pseudo-random walk seeded by shelf index.
    let seed = (s + 1) * 2654435761;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    while (x < usableW / 2 - 0.04) {
      const bw = 0.025 + rnd() * 0.04;
      if (x + bw > usableW / 2) break;
      // Occasional gap (a missing book).
      if (rnd() > 0.18) {
        const bh = gapH * (0.62 + rnd() * 0.3);
        const col = BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)];
        books.push(
          <mesh key={`bk-${bookKey++}`} position={[x + bw / 2, baseY + bh / 2, 0.02]}>
            <boxGeometry args={[bw, bh, depth * 0.62]} />
            <meshStandardMaterial color={col} roughness={0.8} metalness={0} />
          </mesh>,
        );
      }
      x += bw + 0.004;
    }
  }

  // Closed base cabinet: two doors filling the lowest compartment.
  const cabinetDoors: JSX.Element[] = [];
  if (hasCabinet) {
    const doorGapH = shelfSpacing - shelfThickness;
    const doorH = doorGapH - 0.01;
    const doorY = shelfThickness + doorGapH / 2;
    const doorW = (usableW - 0.006) / 2;
    const handleColor = '#3a3a3c';
    [-1, 1].forEach((s) => {
      const cx = s * (doorW / 2 + 0.003);
      cabinetDoors.push(
        <mesh key={`door${s}`} castShadow position={[cx, doorY, depth / 2 - 0.012]} material={wood}>
          <boxGeometry args={[doorW, doorH, 0.018]} />
        </mesh>,
      );
      // Vertical bar handle near the centre gap.
      cabinetDoors.push(
        <mesh key={`h${s}`} position={[s * 0.02, doorY, depth / 2]}>
          <boxGeometry args={[0.012, doorH * 0.4, 0.018]} />
          <meshStandardMaterial color={handleColor} roughness={0.4} metalness={0.6} />
        </mesh>,
      );
    });
  }

  return (
    <group>
      {/* Recessed plinth (toe-kick) */}
      <mesh castShadow receiveShadow position={[0, plinthH / 2, 0.02]} material={wood}>
        <boxGeometry args={[width - 0.06, plinthH, depth - 0.06]} />
      </mesh>
      {/* Carcass lifted onto the plinth */}
      <group position={[0, plinthH, 0]}>
        {/* Sides */}
        <mesh castShadow position={[-width / 2 + sideThickness / 2, carcassH / 2, 0]} material={wood}>
          <boxGeometry args={[sideThickness, carcassH, depth]} />
        </mesh>
        <mesh castShadow position={[width / 2 - sideThickness / 2, carcassH / 2, 0]} material={wood}>
          <boxGeometry args={[sideThickness, carcassH, depth]} />
        </mesh>
        {/* Back */}
        <mesh receiveShadow position={[0, carcassH / 2, -depth / 2 + backThickness / 2]} material={wood}>
          <boxGeometry args={[width - sideThickness * 2, carcassH, backThickness]} />
        </mesh>
        {shelves}
        {books}
        {cabinetDoors}
      </group>
    </group>
  );
}
