import type { ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useCallback } from 'react'
import { itemFootprint } from '../collision/placement'
import { ContactShadow } from '../scene/ContactShadow'
import { canEditScene } from '../state/editing'
import { useStore } from '../state/store'
import { GltfErrorBoundary } from './GltfErrorBoundary'
import { GltfModel } from './GltfModel'
import { selectGltfRender } from './gltfRender'
import { PRIMITIVE_COMPONENTS } from './primitives'
import { isTilted, itemRotation } from './tiltRotation'
import type { FurnitureDef, FurnitureItem, GltfDef } from './types'

interface FurnitureProps {
  item: FurnitureItem
  def: FurnitureDef
  /** When true, the click handler does NOT mutate selection — used by
   *  ghost previews. */
  passive?: boolean
  /** Render a soft contact shadow under floor items (off on the low tier). */
  contactShadow?: boolean
  /** Bumped when a DLC/catalog material is (re)built; forces a re-render so
   *  the primitive's synchronous material lookup finds the new material. */
  materialEpoch?: number
}

function FurnitureInner({ item, def, passive, contactShadow }: FurnitureProps) {
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (passive) return
      const state = useStore.getState()
      // Selection happens only inside the per-room editor; orbit/walk are view-only.
      if (!canEditScene(state)) return
      e.stopPropagation()
      // Shift-click extends/toggles the multi-selection; plain click
      // selects the item's group (or the item, if ungrouped) with drill-in
      // on a repeat/Alt click (see selectItemGrouped).
      if (e.shiftKey) state.toggleSelectedItem(item.id)
      else state.selectItemGrouped(item.id, { alt: e.altKey })
    },
    [item.id, passive],
  )

  // Pointer-down begins a drag in select mode. We capture the original
  // transform here so DragController can revert if the release lands on
  // an invalid spot. The hit point on the floor is used to compute an
  // offset so the item doesn't snap-jump to the cursor.
  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (passive) return
      const state = useStore.getState()
      if (!canEditScene(state)) return
      if (state.activeDefId) return
      e.stopPropagation()
      // Shift-pointerdown defers selection to the click handler (which
      // toggles). Plain click preserves an existing multi-selection if
      // the grabbed item is already part of it; only collapse otherwise.
      if (!e.shiftKey && !state.selectedItemIds.includes(item.id)) {
        state.selectItemGrouped(item.id, { alt: e.altKey })
      }
      // Locked items can be selected (to unlock) but not dragged.
      if (item.locked) return
      const offset: [number, number] = [e.point.x - item.position[0], e.point.z - item.position[1]]
      // If the grabbed item is part of a multi-selection, snapshot every
      // member's transform so DragController can translate the whole
      // group in lock-step.
      const post = useStore.getState()
      const ids = post.selectedItemIds.includes(item.id) ? post.selectedItemIds : [item.id]
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
          : undefined
      state.startDrag(
        item.id,
        { position: [item.position[0], item.position[1]], rotation: item.rotation },
        offset,
        groupOriginals,
      )
    },
    [item.id, item.position, item.rotation, passive, item.locked],
  )

  const body =
    def.kind === 'parametric' ? (
      (() => {
        const Component = PRIMITIVE_COMPONENTS[def.primitive]
        return <Component props={item.props} />
      })()
    ) : (
      <GltfErrorBoundary
        width={def.defaultFootprint.w}
        depth={def.defaultFootprint.d}
        height={Math.min(def.defaultFootprint.w, def.defaultFootprint.d, 0.9)}
      >
        <Suspense fallback={null}>
          {(() => {
            const r = selectGltfRender(item, def as GltfDef)
            if (!r) return null
            return (
              <GltfModel
                url={r.url}
                scale={r.scale3}
                tint={r.tint}
                finishOverrides={r.finishOverrides}
                reflective={r.reflective}
              />
            )
          })()}
        </Suspense>
      </GltfErrorBoundary>
    )

  // GLB items lift by props.surfaceHeight so a stacked model (mattress on a
  // frame) renders at its support surface. Parametric primitives self-lift in
  // local space, so they stay at group-Y 0 to avoid double-counting.
  const liftY =
    typeof item.props['surfaceHeight'] === 'number' ? (item.props['surfaceHeight'] as number) : 0
  // Per-item elevation raises the whole piece off the floor (SH3D parity).
  const elevation = item.elevation ?? 0

  return (
    <group
      position={[
        item.position[0],
        (def.kind === 'parametric' ? 0 : liftY) + elevation,
        item.position[1],
      ]}
      rotation={itemRotation(item)}
      // Tag the root group with the item id so manual raycasts (canvas finish
      // drop — scene/finishDropTarget.ts) can map a hit back to the item.
      userData={{ itemId: item.id }}
      onClick={onClick}
      onPointerOver={(e) => {
        if (passive) return
        const state = useStore.getState()
        if (!canEditScene(state)) return
        if (state.draggingItemId || state.activeDefId) return
        e.stopPropagation()
        state.setHovered(item.id)
      }}
      onPointerOut={() => {
        if (passive) return
        const state = useStore.getState()
        if (state.hoveredItemId === item.id) state.setHovered(null)
      }}
      onDoubleClick={(e) => {
        if (passive) return
        const state = useStore.getState()
        if (!canEditScene(state)) return
        e.stopPropagation()
        state.focusOn(item.position)
      }}
      onContextMenu={(e) => {
        if (passive) return
        const state = useStore.getState()
        if (!canEditScene(state)) return
        e.stopPropagation()
        e.nativeEvent.preventDefault()
        if (!state.selectedItemIds.includes(item.id)) state.selectItemGrouped(item.id, {})
        state.openContextMenu({
          x: e.nativeEvent.clientX,
          y: e.nativeEvent.clientY,
          itemId: item.id,
        })
      }}
      onPointerDown={onPointerDown}
    >
      {/* Soft contact shadow grounding floor-standing pieces. The outer group
          may be lifted by `liftY` for a stacked GLB (mattress on a frame), so
          counter-translate the shadow back to the floor (world Y≈0). */}
      {(() => {
        if (!contactShadow) return null
        const span = def.verticalSpan ?? { base: 0, top: def.defaultFootprint.h }
        // No floor contact shadow under a tilted or elevated (off-floor) piece.
        if (
          passive ||
          def.mounted ||
          def.noClip ||
          span.base >= 0.4 ||
          isTilted(item) ||
          elevation > 0.01
        )
          return null
        const obb = itemFootprint(item, def)
        return <ContactShadow w={obb.hx * 2} d={obb.hz * 2} y={-liftY} />
      })()}
      {/* Mirror flips in local space. three.js flips winding/normals for the
          negative-determinant matrix, so lighting + culling stay correct. */}
      {item.flipX || item.flipZ ? (
        <group scale={[item.flipX ? -1 : 1, 1, item.flipZ ? -1 : 1]}>{body}</group>
      ) : (
        body
      )}
    </group>
  )
}

/**
 * Memoised: a Furniture re-renders only when its own item or def slice
 * changes, so dragging one item does not invalidate every other item.
 */
export const Furniture = memo(FurnitureInner, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.def === next.def &&
    prev.passive === next.passive &&
    prev.contactShadow === next.contactShadow &&
    prev.materialEpoch === next.materialEpoch
  )
})
