import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { nearestWallGap, wallGapsPerSide } from '../collision/clearanceGap'
import { canPlace, itemFootprint } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { wallSnapOffset } from '../collision/wallSnap'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { isIkeaDef, useCatalogGetter } from '../furniture/catalog'
import { resolveCompatible } from '../furniture/ikea/compatibility'
import { combineOnto } from '../furniture/ikea/stacking'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import { boxEdges, useDisposeGeometry } from './geometryUtil'
import { snapToGrid } from './snap'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)
const ALIGN_TH = 0.1 // alignment snap threshold (m)

/** Axis-aligned half-extents [hx, hz] of an item's footprint at its rotation. */
function halfExtents(
  item: { rotation: number; props: Record<string, unknown> },
  def: import('../furniture/types').FurnitureDef,
): [number, number] {
  let w = def.defaultFootprint.w
  let d = def.defaultFootprint.d
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {}
    const wv = item.props[map.w ?? 'width']
    const dv = item.props[map.d ?? 'depth']
    if (typeof wv === 'number') w = wv
    if (typeof dv === 'number') d = dv
  }
  const c = Math.abs(Math.cos(item.rotation))
  const s = Math.abs(Math.sin(item.rotation))
  return [(c * w + s * d) / 2, (s * w + c * d) / 2]
}

/** Best 1-D snap of a dragged centre (half-extent `dh`) to others' centres and
 *  edges — centre-align, edge-align, or butt-adjacent. Returns the snapped
 *  centre + the guide-line coordinate, or null if nothing's within threshold. */
function snapAxis(
  center: number,
  dh: number,
  others: Array<{ c: number; h: number }>,
): { center: number; guide: number } | null {
  let best: { center: number; guide: number; d: number } | null = null
  for (const o of others) {
    const cands: Array<{ center: number; guide: number }> = [
      { center: o.c, guide: o.c }, // centres aligned
      { center: o.c - o.h + dh, guide: o.c - o.h }, // near edges aligned
      { center: o.c + o.h - dh, guide: o.c + o.h }, // far edges aligned
      { center: o.c - o.h - dh, guide: o.c - o.h }, // butt against o's near side
      { center: o.c + o.h + dh, guide: o.c + o.h }, // butt against o's far side
    ]
    for (const cand of cands) {
      const d = Math.abs(cand.center - center)
      if (d < ALIGN_TH && (!best || d < best.d)) best = { ...cand, d }
    }
  }
  return best
}

/** True when world point (px,pz) falls inside item `it`'s footprint OBB. */
function pointInFootprint(px: number, pz: number, it: FurnitureItem, def: FurnitureDef): boolean {
  const obb = itemFootprint(it, def)
  const dx = px - obb.cx
  const dz = pz - obb.cz
  const cos = Math.cos(obb.rot)
  const sin = Math.sin(obb.rot)
  // Rotate the offset into the OBB's local (axis-aligned) frame.
  const lx = dx * cos + dz * sin
  const lz = -dx * sin + dz * cos
  return Math.abs(lx) <= obb.hx && Math.abs(lz) <= obb.hz
}

/** Snug-stack candidate: the dragged item is the TOP, the hovered item the
 *  BASE — engages only when the base IKEA def accepts the dragged IKEA def's
 *  category (a confirmed compatibility match). Returns the base item or null. */
function snapBase(
  draggedDef: FurnitureDef | undefined,
  hoveredItem: FurnitureItem | null,
  hoveredDef: FurnitureDef | undefined,
): FurnitureItem | null {
  if (!hoveredItem || !draggedDef || !hoveredDef) return null
  if (!isIkeaDef(draggedDef) || !isIkeaDef(hoveredDef)) return null
  const matches = resolveCompatible(hoveredDef, [draggedDef])
  const any = Object.values(matches).some((list) => list.length > 0)
  return any ? hoveredItem : null
}

/**
 * Tracks the active furniture drag started by Furniture.onPointerDown.
 * Each pointer-move unprojects to the floor, live-updates the item's
 * position via moveItem, and writes the placement validity so the red
 * tint highlight can react. On pointer-up: if the latest position is
 * invalid the item is reverted to its drag-start transform.
 *
 * Lives inside the Canvas because it needs access to the active camera
 * and the GL DOM element for raycasting.
 */
export function DragController() {
  const { camera, gl } = useThree()
  // Stable getter — does NOT re-render this in-canvas controller when the
  // catalog changes (a bulk import would otherwise re-render it thousands of
  // times, starving the render loop → white flicker). `catalogRef` mirrors the
  // existing lazy-read pattern in the handlers below.
  const { ref: catalogRef } = useCatalogGetter()

  const ndc = useMemo(() => new Vector2(), [])
  const raycaster = useMemo(() => new Raycaster(), [])
  const target = useMemo(() => new Vector3(), [])

  // Id of the compatible base the dragged item would snug-stack onto, or null.
  // Mirrored in a ref so the window listeners (which read it on drop) see the
  // latest value without re-subscribing; state drives the highlight render.
  const [snapBaseId, setSnapBaseId] = useState<string | null>(null)
  const snapBaseIdRef = useRef<string | null>(null)
  const setSnap = (id: string | null) => {
    if (snapBaseIdRef.current === id) return
    snapBaseIdRef.current = id
    setSnapBaseId(id)
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: catalogRef is a stable ref read lazily inside handlers (intentionally not a dep — re-subscribing per catalog change is exactly what we're avoiding); setSnap is a stable state setter.
  useEffect(() => {
    const dom = gl.domElement

    const project = (clientX: number, clientY: number): [number, number] | null => {
      const rect = dom.getBoundingClientRect()
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      )
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, target)
      if (!hit) return null
      return [target.x, target.z]
    }

    const onMove = (ev: PointerEvent) => {
      const state = useStore.getState()
      const id = state.draggingItemId
      if (!id) return
      const hit = project(ev.clientX, ev.clientY)
      if (!hit) return
      // Index items once per move so the repeated lookups below are O(1) rather
      // than re-scanning the whole list several times per pointermove.
      const itemsById = new Map(state.items.map((i) => [i.id, i]))
      const [hx, hz] = hit
      const [ox, oz] = state.dragOffset
      let next: [number, number] = [hx - ox, hz - oz]
      // Snap to the alignment grid when enabled (precise placement).
      if (state.snapEnabled) next = snapToGrid(next, state.gridSize)

      const group = state.dragGroupOriginals
      // Smart alignment guides: for a single-item drag, snap centres AND edges
      // to nearby items (line up rows / butt pieces together), surfacing guide
      // lines. Edge + adjacency candidates make pieces sit flush.
      const guides: Array<{ axis: 'x' | 'z'; value: number }> = []
      if (group.length <= 1) {
        const dragItem = itemsById.get(id)
        const dragDef = dragItem ? catalogRef.current[dragItem.defId] : undefined
        if (dragDef && dragItem) {
          const dh = halfExtents(dragItem, dragDef)
          const others = state.items
            .filter((i) => i.id !== id && catalogRef.current[i.defId])
            .map((i) => ({ c: i.position, h: halfExtents(i, catalogRef.current[i.defId]) }))
          const sx = snapAxis(
            next[0],
            dh[0],
            others.map((o) => ({ c: o.c[0], h: o.h[0] })),
          )
          const sz = snapAxis(
            next[1],
            dh[1],
            others.map((o) => ({ c: o.c[1], h: o.h[1] })),
          )
          if (sx) {
            next = [sx.center, next[1]]
            guides.push({ axis: 'x', value: sx.guide })
          }
          if (sz) {
            next = [next[0], sz.center]
            guides.push({ axis: 'z', value: sz.guide })
          }
          // Flush-to-wall snap (corner-capable). Skipped when grid-snap is on —
          // that's a deliberate precise mode the user shouldn't have overridden.
          if (!state.snapEnabled) {
            // Bound the snap to the same walls placement validates against, but
            // never let it be empty (the default flat needs its door-aware walls
            // to snap to, where placementWalls returns undefined).
            const wallsForSnap = placementWalls(state) ?? buildCollisionWalls(state.doors)
            const box = {
              x0: next[0] - dh[0],
              z0: next[1] - dh[1],
              x1: next[0] + dh[0],
              z1: next[1] + dh[1],
            }
            const ws = wallSnapOffset(box, wallsForSnap)
            if (ws.dx) next = [next[0] + ws.dx, next[1]]
            if (ws.dz) next = [next[0], next[1] + ws.dz]
          }
        }
      }
      state.setDragGuides(guides)

      // Snug-stacking candidate (single-item drag only): if the dragged item's
      // centre lands over a compatible base item's footprint, flag that base
      // for a highlight + a snap commit on release. Otherwise behave as a
      // normal free drag.
      let snap: FurnitureItem | null = null
      if (group.length <= 1) {
        const draggedItem = itemsById.get(id)
        const draggedDef = draggedItem ? catalogRef.current[draggedItem.defId] : undefined
        if (draggedItem && draggedDef) {
          for (const cand of state.items) {
            if (cand.id === id) continue
            const candDef = catalogRef.current[cand.defId]
            if (!candDef) continue
            if (!pointInFootprint(next[0], next[1], cand, candDef)) continue
            const base = snapBase(draggedDef, cand, candDef)
            if (base) {
              snap = base
              break
            }
          }
        }
      }
      setSnap(snap ? snap.id : null)

      if (group.length > 1 && state.dragOriginal) {
        // Translate every group member by the same delta as the anchor.
        const dx = next[0] - state.dragOriginal.position[0]
        const dz = next[1] - state.dragOriginal.position[1]
        for (const orig of group) {
          state.moveItem(orig.id, [orig.position[0] + dx, orig.position[1] + dz])
        }
      } else {
        state.moveItem(id, next)
      }

      // Re-read state so freshly-moved items are included in canPlace.
      const after = useStore.getState()
      const afterById = new Map(after.items.map((i) => [i.id, i]))
      const movedIds = group.length > 1 ? group.map((g) => g.id) : [id]
      // For group drags, ignore in-group pairs when checking collisions —
      // their relative positions don't change, so any pair-wise overlap
      // would have existed at drag-start. Walls and unselected items
      // still apply.
      const inGroup = new Set(movedIds)
      const others =
        group.length > 1 ? after.items.filter((it) => !inGroup.has(it.id)) : after.items
      // Inside the per-room editor this is the room's solid perimeter (so a
      // piece can't be dragged past the walls into adjacent rooms); elsewhere a
      // custom plan's own walls / the fixed flat's door-aware walls.
      const planWalls = placementWalls(after, afterById.get(id)?.levelId)
      let valid = true
      for (const mid of movedIds) {
        const item = afterById.get(mid)
        const def = item ? catalogRef.current[item.defId] : null
        if (!item || !def) continue
        if (
          !canPlace(item, def, {
            others,
            defs: catalogRef.current,
            doors: after.doors,
            walls: planWalls,
          })
        ) {
          valid = false
          break
        }
      }
      if (valid !== after.dragValid) state.setDragValid(valid)

      // Live wall-clearance readout for a single-item drag.
      if (group.length <= 1) {
        const item = afterById.get(id)
        const def = item ? catalogRef.current[item.defId] : null
        if (item && def) {
          const [hx, hz] = halfExtents(item, def)
          const box = {
            x0: item.position[0] - hx,
            z0: item.position[1] - hz,
            x1: item.position[0] + hx,
            z1: item.position[1] + hz,
          }
          const walls = planWalls ?? buildCollisionWalls(after.doors)
          state.setDragClearance(nearestWallGap(box, walls))
          state.setDragWallGaps(wallGapsPerSide(box, walls))
        }
      }
    }

    const onUp = () => {
      const state = useStore.getState()
      const id = state.draggingItemId
      if (!id) {
        setSnap(null)
        return
      }

      // Snug-stack commit: a compatible base is under the dragged item — snap
      // it onto the base (support height, centred, grouped) instead of writing
      // the free floor position. Reuses the dragged item's id (moves it; no
      // duplicate) and adopts the resolved transform/props/groupId.
      const baseId = snapBaseIdRef.current
      if (baseId) {
        const draggedItem = state.items.find((i) => i.id === id)
        const draggedDef = draggedItem ? catalogRef.current[draggedItem.defId] : undefined
        const base = state.items.find((i) => i.id === baseId)
        const baseDef = base ? catalogRef.current[base.defId] : undefined
        if (
          draggedItem &&
          draggedDef &&
          base &&
          baseDef &&
          isIkeaDef(draggedDef) &&
          isIkeaDef(baseDef)
        ) {
          // The base "accepts" the dragged item under some category; combineOnto
          // branches on it (vertical stack vs around-placement).
          const matches = resolveCompatible(baseDef, [draggedDef])
          const category = Object.entries(matches).find(([, l]) => l.length > 0)?.[0]
          const draggedVariant =
            draggedDef.variants.find(
              (v) => v.finish === (draggedItem.props['variant'] ?? draggedDef.activeVariant),
            ) ?? draggedDef.variants[0]
          const res = category
            ? combineOnto(base, baseDef, draggedDef, draggedVariant, category)
            : { error: 'no category' as const }
          if ('items' in res && res.items.length) {
            const st = useStore.getState()
            st.pushHistory()
            const groupId = res.groupId
            const baseHadGroup = !!base.groupId
            const placed = res.items[0] // single item for a drag
            st.setItems(
              st.items.map((it) => {
                if (it.id === draggedItem.id) {
                  // Merge resolved props, but drop a stale surfaceHeight when the
                  // new placement is floor-standing (e.g. re-dragging a once-
                  // stacked item onto a table → 'around', no lift).
                  const mergedProps = { ...it.props, ...placed.props }
                  if (!('surfaceHeight' in placed.props)) delete mergedProps['surfaceHeight']
                  return {
                    ...it,
                    position: placed.position,
                    rotation: placed.rotation,
                    groupId,
                    props: mergedProps,
                  }
                }
                if (it.id === base.id && !baseHadGroup) return { ...it, groupId }
                return it
              }),
            )
            st.setSelectedItemIds([draggedItem.id])
            setSnap(null)
            state.endDrag()
            return // skip normal free-placement commit
          }
        }
      }
      setSnap(null)

      if (!state.dragValid) {
        const group = state.dragGroupOriginals
        if (group.length > 1) {
          for (const orig of group) {
            state.moveItem(orig.id, orig.position)
            state.rotateItem(orig.id, orig.rotation)
          }
        } else if (state.dragOriginal) {
          state.moveItem(id, state.dragOriginal.position)
          state.rotateItem(id, state.dragOriginal.rotation)
        }
      }
      state.endDrag()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [camera, gl, ndc, raycaster, target])

  return <SnapBaseHighlight baseId={snapBaseId} catalog={catalogRef.current} />
}

/** Outline around the compatible base the dragged item will snug-stack onto —
 *  mirrors HoverHighlight's edges-box styling, tinted green to read as a valid
 *  snap target. Rendered only while a snap candidate is active mid-drag. */
function SnapBaseHighlight({
  baseId,
  catalog,
}: {
  baseId: string | null
  catalog: Record<string, FurnitureDef>
}) {
  const items = useStore((s) => s.items)
  const item = baseId ? items.find((i) => i.id === baseId) : null
  const def = item ? catalog[item.defId] : null
  const obb = useMemo(() => (item && def ? itemFootprint(item, def) : null), [item, def])
  const geom = useMemo(
    () => (obb ? boxEdges(obb.hx * 2 + 0.08, 0.001, obb.hz * 2 + 0.08) : null),
    [obb],
  )
  useDisposeGeometry(geom)

  if (!obb || !geom) return null
  return (
    <lineSegments
      geometry={geom}
      position={[obb.cx, 0.02, obb.cz]}
      rotation={[0, obb.rot, 0]}
      renderOrder={3}
    >
      <lineBasicMaterial color="#34d399" transparent opacity={0.9} depthWrite={false} />
    </lineSegments>
  )
}
