import { readNum, readStr } from './shared';
import { getSurfaceMaterial } from '../../materials/furnitureMaterials';
import type { ParamProps } from '../types';

/**
 * Freestanding room divider — a timber screen for zoning an open-concept flat
 * (living ↔ dining) or screening an entry foyer. `style` is a see-through run
 * of vertical 'slat' battens, a solid 'fluted' panel, or an open 'grid'
 * lattice. Sits in a slim floor frame so it stands on its own. Thin footprint,
 * tall; a real obstacle (collides), faces +Z. Built at real-world metres.
 */
export function RoomDivider({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.6);
  const height = readNum(props, 'height', 2.0);
  const color = readStr(props, 'color', '#7a5c3c');
  const finish = readStr(props, 'finish', 'wood');
  const sheen = readNum(props, 'sheen', 0);
  const style = readStr(props, 'style', 'slat');

  const mat = getSurfaceMaterial(finish, color, 1.4, sheen);
  const frameT = 0.05; // frame post / rail thickness
  const depth = 0.06; // screen thickness
  const innerW = width - frameT * 2;
  const innerH = height - frameT * 2;

  // Slat / grid spacing.
  const battenW = 0.035;
  const gap = style === 'grid' ? 0.11 : 0.075;
  const nCols = Math.max(1, Math.round((innerW - battenW) / (battenW + gap)));
  const colStep = nCols > 1 ? (innerW - battenW) / (nCols - 1) : 0;
  const nRows = style === 'grid' ? Math.max(1, Math.round((innerH - battenW) / (battenW + gap))) : 0;
  const rowStep = nRows > 1 ? (innerH - battenW) / (nRows - 1) : 0;

  return (
    <group>
      {/* Outer frame: two posts + top/bottom rails. */}
      {[-1, 1].map((s) => (
        <mesh key={`post${s}`} castShadow receiveShadow position={[s * (width / 2 - frameT / 2), height / 2, 0]} material={mat}>
          <boxGeometry args={[frameT, height, depth]} />
        </mesh>
      ))}
      {[frameT / 2, height - frameT / 2].map((y, i) => (
        <mesh key={`rail${i}`} castShadow receiveShadow position={[0, y, 0]} material={mat}>
          <boxGeometry args={[width - frameT * 2, frameT, depth]} />
        </mesh>
      ))}

      {style === 'fluted' ? (
        // Solid panel with shallow vertical flutes (a row of half-round ribs).
        <>
          <mesh castShadow receiveShadow position={[0, height / 2, 0]} material={mat}>
            <boxGeometry args={[innerW, innerH, depth * 0.6]} />
          </mesh>
          {Array.from({ length: nCols }, (_, i) => {
            const x = -innerW / 2 + battenW / 2 + i * colStep;
            return (
              <mesh key={i} castShadow position={[x, height / 2, depth * 0.35]} material={mat}>
                <cylinderGeometry args={[battenW / 2, battenW / 2, innerH, 8, 1, false, 0, Math.PI]} />
              </mesh>
            );
          })}
        </>
      ) : (
        <>
          {/* Vertical battens (slat + grid). */}
          {Array.from({ length: nCols }, (_, i) => {
            const x = -innerW / 2 + battenW / 2 + i * colStep;
            return (
              <mesh key={`v${i}`} castShadow receiveShadow position={[x, height / 2, 0]} material={mat}>
                <boxGeometry args={[battenW, innerH, depth * 0.7]} />
              </mesh>
            );
          })}
          {/* Horizontal battens for the grid lattice. */}
          {style === 'grid' &&
            Array.from({ length: nRows }, (_, j) => {
              const y = frameT + battenW / 2 + j * rowStep;
              return (
                <mesh key={`h${j}`} castShadow receiveShadow position={[0, y, 0]} material={mat}>
                  <boxGeometry args={[innerW, battenW, depth * 0.7]} />
                </mesh>
              );
            })}
        </>
      )}
    </group>
  );
}
