import { readNum, readStr, STYLISED_METALNESS, STYLISED_ROUGHNESS } from './shared';
import type { ParamProps } from '../types';

interface WallShelfProps {
  props: ParamProps;
}

/**
 * WallShelf primitive: floating wall-mounted shelving — N parallel shelves
 * stacked around a configurable mountHeight, with thin decorative backplate
 * trim per shelf. No sides and no full back panel; that's the contrast vs
 * Bookshelf. The opening faces +Z (the room).
 */
export function WallShelf({ props }: WallShelfProps) {
  const width = readNum(props, 'width', 1.2);
  const shelfCount = Math.max(1, Math.min(4, Math.round(readNum(props, 'shelfCount', 2))));
  const mountHeight = readNum(props, 'mountHeight', 1.4);
  const color = readStr(props, 'color', '#caa478');

  const depth = 0.22;
  const shelfThickness = 0.025;
  const backplateThickness = 0.012;
  const backplateHeight = 0.06;
  const verticalSpacing = 0.32;

  // Center the stack around mountHeight
  const totalSpan = (shelfCount - 1) * verticalSpacing;
  const baseY = mountHeight - totalSpan / 2;

  const shelves = Array.from({ length: shelfCount }, (_, i) => {
    const y = baseY + i * verticalSpacing;
    return (
      <group key={i} position={[0, y, 0]}>
        {/* Shelf plate */}
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <boxGeometry args={[width, shelfThickness, depth]} />
          <meshStandardMaterial
            color={color}
            roughness={STYLISED_ROUGHNESS}
            metalness={STYLISED_METALNESS}
          />
        </mesh>
        {/* Decorative backplate trim suggests wall mounting */}
        <mesh
          position={[0, backplateHeight / 2 - shelfThickness / 2, -depth / 2 + backplateThickness / 2]}
        >
          <boxGeometry args={[width, backplateHeight, backplateThickness]} />
          <meshStandardMaterial
            color={color}
            roughness={STYLISED_ROUGHNESS}
            metalness={STYLISED_METALNESS}
          />
        </mesh>
      </group>
    );
  });

  return <group>{shelves}</group>;
}
