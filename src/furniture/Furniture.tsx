import type { ThreeEvent } from '@react-three/fiber'
import { memo, Suspense, useCallback, useEffect, useRef } from 'react'
import type { Group, Material, Mesh } from 'three'
import { Plane, Vector3 } from 'three'
import { floorPointInFootprint, itemFootprint } from '../collision/placement'
import { isFeatureEnabled } from '../features/featureFlags'
import { ContactShadow } from '../scene/ContactShadow'
import { markPointerDownOnItem } from '../scene/clickVsDrag'
import { registerDropGroup } from '../scene/placementDrop'
import { canEditScene, dispatchWalkInteract } from '../state/editing'
import { useStore } from '../state/store'
import { GltfErrorBoundary } from './GltfErrorBoundary'
import { GltfModel } from './GltfModel'
import { selectGltfRender } from './gltfRender'
import { PRIMITIVE_COMPONENTS } from './primitives'
import { surfaceDecalSpec } from './surfaceDecal'
import { isTilted, itemRotation } from './tiltRotation'
import type { FurnitureDef, FurnitureItem, GltfDef } from './types'
import { isInteractableWindowFixture } from './windowFixtureInteract'

/** Ground plane (y=0) + a scratch vector for projecting the hover cursor ray onto
 *  the floor, so hover can be gated on footprint containment (HOVER-FOOTPRINT). */
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const floorHit = new Vector3()

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
      // Walk-mode interact (WINDOW-FIXTURE-INTERACT): click/tap a curtain or
      // roller blind to toggle it open/closed, mirroring the door interact
      // affordance (E-key handled separately in App.tsx via nearbyFixtureId).
      // `dispatchWalkInteract` is the single gate on camera mode — orbit
      // never toggles it, clicking there keeps its existing selection
      // semantics below (`canEditScene`, orbit-only).
      if (isFeatureEnabled('walkWindowFixtures') && isInteractableWindowFixture(def)) {
        if (dispatchWalkInteract(state, item.id, state.toggleWindowFixture)) {
          e.stopPropagation()
          return
        }
      }
      // Selection happens only inside the per-room editor; orbit/walk are view-only.
      if (!canEditScene(state)) return
      e.stopPropagation()
      // Shift-click extends/toggles the multi-selection; plain click
      // selects the item's group (or the item, if ungrouped) with drill-in
      // on a repeat/Alt click (see selectItemGrouped).
      if (e.shiftKey) state.toggleSelectedItem(item.id)
      else state.selectItemGrouped(item.id, { alt: e.altKey })
    },
    [item.id, passive, def],
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
      // Mark the gesture as item-started so its release can't deselect via
      // onPointerMissed after the inspector resizes the canvas (INSPECTOR-FLICKER).
      markPointerDownOnItem()
      // Shift-pointerdown defers selection to the click handler (which
      // toggles). Plain click preserves an existing multi-selection if
      // the grabbed item is already part of it; only collapse otherwise.
      if (!e.shiftKey && !state.selectedItemIds.includes(item.id)) {
        state.selectItemGrouped(item.id, { alt: e.altKey })
      }
      // Locked items can be selected (to unlock) but not dragged. Window-bound
      // fixtures (curtains/blinds) are static on their window — selectable but
      // never dragged (WINDOW-FIXTURE).
      if (item.locked || def.windowBound) return
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
    [item.id, item.position, item.rotation, passive, item.locked, def.windowBound],
  )

  // Hover is gated on the FOOTPRINT, not the raw mesh (HOVER-FOOTPRINT): project
  // the cursor ray onto the floor and highlight only when that point is inside
  // the item's min-span footprint, so tall geometry overhanging the base doesn't
  // light the piece up. Runs on enter + move (the cursor can cross the footprint
  // boundary while still over the mesh); pointer-out clears it. Selection stays on
  // the visible mesh via the group's click/pointerdown handlers.
  const updateHover = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (passive) return
      const state = useStore.getState()
      if (!canEditScene(state)) return
      if (state.draggingItemId || state.activeDefId) return
      // The cursor is over this item's mesh, so it owns the hover — never let the
      // room floor behind it also register a hover.
      e.stopPropagation()
      const inside = e.ray.intersectPlane(FLOOR_PLANE, floorHit)
        ? floorPointInFootprint(floorHit.x, floorHit.z, item, def)
        : false
      if (inside) {
        if (state.hoveredItemId !== item.id) state.setHovered(item.id)
      } else if (state.hoveredItemId === item.id) {
        state.setHovered(null)
      }
    },
    [item, def, passive],
  )

  const body =
    def.kind === 'parametric' ? (
      (() => {
        const Component = PRIMITIVE_COMPONENTS[def.primitive]
        // Universal per-item resize (CUSTOMIZE-PARAM-SIZE): a `scale` (+ optional
        // per-axis scaleX/Y/Z) prop scales the primitive about its floor-anchored,
        // footprint-centred origin. Collision already reads the same props in
        // `itemFootprint`, so render + footprint stay consistent. No wrapper at 1×
        // (byte-identical to before).
        const sc = typeof item.props['scale'] === 'number' ? (item.props['scale'] as number) : 1
        const psx = typeof item.props['scaleX'] === 'number' ? (item.props['scaleX'] as number) : sc
        const psy = typeof item.props['scaleY'] === 'number' ? (item.props['scaleY'] as number) : sc
        const psz = typeof item.props['scaleZ'] === 'number' ? (item.props['scaleZ'] as number) : sc
        const el = <Component props={item.props} />
        return psx !== 1 || psy !== 1 || psz !== 1 ? (
          <group scale={[psx, psy, psz]}>{el}</group>
        ) : (
          el
        )
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

  // Per-item opacity (CUSTOMIZE-OPACITY): ghost a piece to see behind it. Applied
  // by cloning each rendered mesh's material (so shared/cached materials aren't
  // mutated for every other item) and setting transparent + opacity; the original
  // is captured per-mesh and restored when opacity returns to 1 / on unmount. A
  // short rAF window re-applies to async-loaded GLB meshes. No work at opacity 1.
  const opacity = typeof item.props['opacity'] === 'number' ? (item.props['opacity'] as number) : 1
  const opacityRootRef = useRef<Group>(null)
  const opacityClonesRef = useRef<Material[]>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: item.props identity drives re-apply (tint/finish changes); def re-keys on swap.
  useEffect(() => {
    const g = opacityRootRef.current
    if (!g) return
    const restore = () => {
      g.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh) return
        const orig = m.userData.__opacityOrig as Material | Material[] | undefined
        if (orig) {
          m.material = orig
          m.userData.__opacityOrig = undefined
        }
      })
      for (const c of opacityClonesRef.current) c.dispose()
      opacityClonesRef.current = []
    }
    if (opacity >= 1) {
      restore()
      return
    }
    const apply = () => {
      g.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh || !m.material) return
        if (m.userData.__opacityOrig != null) return // already ghosted
        m.userData.__opacityOrig = m.material
        const arr = Array.isArray(m.material) ? m.material : [m.material]
        const cloned = arr.map((mm) => {
          const c = (mm as Material).clone()
          c.transparent = true
          c.opacity = opacity
          c.depthWrite = false
          opacityClonesRef.current.push(c)
          return c
        })
        m.material = cloned.length === 1 ? cloned[0] : cloned
      })
    }
    apply()
    // Catch async GLB meshes that mount after this effect runs (~0.5 s window).
    let frames = 0
    let raf = requestAnimationFrame(function tick() {
      apply()
      if (++frames < 30) raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(raf)
      restore()
    }
  }, [opacity, item.props, def])

  // Register the root group for the placement drop-in animator (placementDrop.ts),
  // which mutates its Y directly for the ~0.3 s drop — Furniture keeps no per-item
  // useFrame. Ghost previews (passive) are excluded.
  useEffect(() => {
    if (passive) return
    const g = opacityRootRef.current
    if (!g) return
    return registerDropGroup(item.id, g)
  }, [item.id, passive])

  return (
    <group
      ref={opacityRootRef}
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
          target: { kind: 'item', id: item.id },
          itemId: item.id,
        })
      }}
      onPointerDown={onPointerDown}
      onPointerOver={updateHover}
      onPointerMove={updateHover}
      onPointerOut={() => {
        if (passive) return
        const state = useStore.getState()
        if (state.hoveredItemId === item.id) state.setHovered(null)
      }}
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
      {/* Surface contact decal (PC2-CONTACT-AO-DECOR): a small, faint blob under
          decor resting ON a table/shelf, so vases/books/bowls/plants read as
          sitting there rather than pasted on. Qualification is pure + tested in
          `surfaceDecal.ts`; the prop self-lifts to `surfaceHeight`, so the decal
          sits there (just above the host top). Only when contact shadows are on. */}
      {(() => {
        if (!contactShadow || passive) return null
        const obb = itemFootprint(item, def)
        const spec = surfaceDecalSpec(def, item.props, obb.hx, obb.hz)
        if (!spec) return null
        return <ContactShadow w={spec.w} d={spec.d} y={spec.y} opacity={0.34} scale={1.35} />
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
