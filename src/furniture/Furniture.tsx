import { Suspense, memo, useCallback } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { GltfModel } from './GltfModel';
import { PRIMITIVE_COMPONENTS } from './primitives';
import { useStore } from '../state/store';
import type { FurnitureDef, FurnitureItem } from './types';

interface FurnitureProps {
  item: FurnitureItem;
  def: FurnitureDef;
  /** When true, the click handler does NOT mutate selection — used by
   *  ghost previews. */
  passive?: boolean;
}

function FurnitureInner({ item, def, passive }: FurnitureProps) {
  const selectItem = useStore((s) => s.selectItem);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (passive) return;
      e.stopPropagation();
      selectItem(item.id);
    },
    [item.id, passive, selectItem],
  );

  const body =
    def.kind === 'parametric' ? (
      (() => {
        const Component = PRIMITIVE_COMPONENTS[def.primitive];
        return <Component props={item.props} />;
      })()
    ) : (
      <Suspense fallback={null}>
        {(() => {
          const url = def.source === 'builtin' ? def.url : def.runtimeUrl;
          if (!url) return null;
          return (
            <GltfModel
              url={url}
              scale={
                (typeof item.props['scale'] === 'number'
                  ? item.props['scale']
                  : def.scale) ?? 1
              }
              tint={typeof item.props['tint'] === 'string' ? item.props['tint'] : undefined}
            />
          );
        })()}
      </Suspense>
    );

  return (
    <group
      position={[item.position[0], 0, item.position[1]]}
      rotation={[0, item.rotation, 0]}
      onClick={onClick}
    >
      {body}
    </group>
  );
}

/**
 * Memoised: a Furniture re-renders only when its own item or def slice
 * changes, so dragging one item does not invalidate every other item.
 */
export const Furniture = memo(FurnitureInner, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.def === next.def &&
    prev.passive === next.passive
  );
});
