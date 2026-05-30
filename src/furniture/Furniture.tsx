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
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (passive) return;
      const state = useStore.getState();
      // Walk mode and rotate-tool are view-only — clicks must not select.
      if (state.cameraMode !== 'orbit') return;
      if (state.editorTool !== 'select') return;
      e.stopPropagation();
      // Shift-click extends/toggles the multi-selection; plain click
      // replaces it with just this item.
      if (e.shiftKey) state.toggleSelectedItem(item.id);
      else state.selectItem(item.id);
    },
    [item.id, passive],
  );

  // Pointer-down begins a drag in select mode. We capture the original
  // transform here so DragController can revert if the release lands on
  // an invalid spot. The hit point on the floor is used to compute an
  // offset so the item doesn't snap-jump to the cursor.
  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (passive) return;
      const state = useStore.getState();
      if (state.cameraMode !== 'orbit') return;
      if (state.editorTool !== 'select') return;
      if (state.activeDefId) return;
      e.stopPropagation();
      // Shift-pointerdown defers selection to the click handler (which
      // toggles). Plain click preserves an existing multi-selection if
      // the grabbed item is already part of it; only collapse otherwise.
      if (!e.shiftKey && !state.selectedItemIds.includes(item.id)) {
        state.selectItem(item.id);
      }
      // Locked items can be selected (to unlock) but not dragged.
      if (item.locked) return;
      const offset: [number, number] = [
        e.point.x - item.position[0],
        e.point.z - item.position[1],
      ];
      // If the grabbed item is part of a multi-selection, snapshot every
      // member's transform so DragController can translate the whole
      // group in lock-step.
      const post = useStore.getState();
      const ids = post.selectedItemIds.includes(item.id) ? post.selectedItemIds : [item.id];
      const groupOriginals =
        ids.length > 1
          ? ids
              .map((id) => post.items.find((it) => it.id === id))
              .filter((it): it is NonNullable<typeof it> => it != null)
              .map((it) => ({
                id: it.id,
                position: [it.position[0], it.position[1]] as [number, number],
                rotation: it.rotation,
              }))
          : undefined;
      state.startDrag(
        item.id,
        { position: [item.position[0], item.position[1]], rotation: item.rotation },
        offset,
        groupOriginals,
      );
    },
    [item.id, item.position, item.rotation, passive],
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
      onPointerDown={onPointerDown}
    >
      {/* Mirror flips in local space. three.js flips winding/normals for the
          negative-determinant matrix, so lighting + culling stay correct. */}
      {item.flipX || item.flipZ ? (
        <group scale={[item.flipX ? -1 : 1, 1, item.flipZ ? -1 : 1]}>{body}</group>
      ) : (
        body
      )}
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
