import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import { type AabbItem, buildGrid, queryRect, type SpatialGrid } from '../collision/broadphase'
import { nearestWallGap, wallGapsPerSide } from '../collision/clearanceGap'
import {
  detectEqualSpacingAxis,
  type EqualSpacing,
  relevantWallFaces,
  type Span,
  type WallFaceInput,
} from '../collision/equalSpacing'
import { canPlace, itemFootprint } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { resolveSurfaceDropHeight } from '../collision/surfaceDrop'
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
const SPACING_TH = 0.08 // equal-spacing match tolerance (m)
const SPACING_BAND = 1.2 // only pair items within this band on the other axis (m)

/** Collision walls → axis-aligned face descriptors for equal-spacing detection. */
function wallFaces(walls: import('../collision/walls').CollisionWall[]): WallFaceInput[] {
  const faces: WallFaceInput[] = []
  for (const w of walls) {
    const t = w.thickness / 2
    if (Math.abs(w.ax - w.bx) < 0.02) {
      faces.push({
        orient: 'v',
        face: w.ax, // inner face approximated at the wall centreline ± thickness handled by caller spacing
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
      // Two faces (both sides) so a piece spaced off either side is caught.
      faces.push({
        orient: 'v',
        face: w.ax + t,
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
      faces.push({
        orient: 'v',
        face: w.ax - t,
        spanMin: Math.min(w.az, w.bz),
        spanMax: Math.max(w.az, w.bz),
      })
    } else if (Math.abs(w.az - w.bz) < 0.02) {
      faces.push({
        orient: 'h',
        face: w.az,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
      faces.push({
        orient: 'h',
        face: w.az + t,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
      faces.push({
        orient: 'h',
        face: w.az - t,
        spanMin: Math.min(w.ax, w.bx),
        spanMax: Math.max(w.ax, w.bx),
      })
    }
  }
  return faces
}

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

/**
 * Footprint AABBs of every item NOT moving during the current drag (PERF-003
 * broadphase). Static items keep their position for the whole pointer drag, so
 * their grid is built once and queried per move. Defless items are skipped (they
 * never collide / never host a snug-stack), matching the canPlace neighbour scan.
 */
function staticAabbs(
  items: readonly FurnitureItem[],
  movedSet: ReadonlySet<string>,
  catalog: Record<string, FurnitureDef>,
): { aabbs: AabbItem[]; staticItems: FurnitureItem[] } {
  const aabbs: AabbItem[] = []
  const staticItems: FurnitureItem[] = []
  for (const it of items) {
    if (movedSet.has(it.id)) continue
    const def = catalog[it.defId]
    if (!def) continue
    const [hx, hz] = halfExtents(it, def)
    aabbs.push({
      id: it.id,
      minX: it.position[0] - hx,
      maxX: it.position[0] + hx,
      minZ: it.position[1] - hz,
      maxZ: it.position[1] + hz,
    })
    staticItems.push(it)
  }
  return { aabbs, staticItems }
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
  // Broadphase cache for the current pointer drag (PERF-003): the non-moved items
  // don't move during a drag, so their spatial grid + AABBs are built once and
  // reused across every pointermove to restrict the snug-stack + canPlace scans to
  // the dragged item's neighbourhood. Keyed by the drag's moved-id signature so a
  // new drag rebuilds it; cleared on drop.
  const dragGridRef = useRef<{
    key: string
    grid: SpatialGrid
    staticItems: FurnitureItem[]
  } | null>(null)
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
      // Broadphase grid for this drag (PERF-003): the items that AREN'T moving keep
      // their positions for the whole gesture, so index them once and reuse across
      // moves to bound the snug-stack + canPlace scans to the dragged neighbourhood.
      const movedIds = group.length > 1 ? group.map((g) => g.id) : [id]
      const movedSet = new Set(movedIds)
      const dragKey = movedIds.join(',')
      let cache = dragGridRef.current
      if (!cache || cache.key !== dragKey) {
        const { aabbs, staticItems } = staticAabbs(state.items, movedSet, catalogRef.current)
        cache = { key: dragKey, grid: buildGrid(aabbs), staticItems }
        dragGridRef.current = cache
      }
      const broadphase = cache

      // Smart alignment guides: for a single-item drag, snap centres AND edges
      // to nearby items (line up rows / butt pieces together), surfacing guide
      // lines. Edge + adjacency candidates make pieces sit flush.
      const guides: Array<{ axis: 'x' | 'z'; value: number }> = []
      const spacings: EqualSpacing[] = []
      if (group.length <= 1) {
        const dragItem = itemsById.get(id)
        const dragDef = dragItem ? catalogRef.current[dragItem.defId] : undefined
        if (dragDef && dragItem) {
          const dh = halfExtents(dragItem, dragDef)
          // Walls are immutable for the duration of a pointer drag, and the snap +
          // equal-spacing passes need the same set — resolve it ONCE per move
          // instead of building it twice (PERF-003).
          const dragWalls = placementWalls(state) ?? buildCollisionWalls(state.doors)
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
            // Bound the snap to the same walls placement validates against (resolved
            // once above as `dragWalls`).
            const box = {
              x0: next[0] - dh[0],
              z0: next[1] - dh[1],
              x1: next[0] + dh[0],
              z1: next[1] + dh[1],
            }
            const ws = wallSnapOffset(box, dragWalls)
            if (ws.dx) next = [next[0] + ws.dx, next[1]]
            if (ws.dz) next = [next[0], next[1] + ws.dz]
          }

          // Equal-spacing smart guides: detect when the dragged item forms a gap
          // equal to gaps among nearby items (or to a wall), per axis. Restrict
          // neighbours to the same row/column (within SPACING_BAND on the other
          // axis) so we only pair items the user is visually aligning — this also
          // bounds the cost in busy scenes. The wall faces feed the same band.
          const faces = wallFaces(dragWalls)
          const dragBox = {
            x0: next[0] - dh[0],
            z0: next[1] - dh[1],
            x1: next[0] + dh[0],
            z1: next[1] + dh[1],
          }
          const wf = relevantWallFaces(faces, dragBox)
          const xOthers: Span[] = others
            .filter((o) => Math.abs(o.c[1] - next[1]) <= dh[1] + o.h[1] + SPACING_BAND)
            .map((o) => ({ lo: o.c[0] - o.h[0], hi: o.c[0] + o.h[0] }))
          const zOthers: Span[] = others
            .filter((o) => Math.abs(o.c[0] - next[0]) <= dh[0] + o.h[0] + SPACING_BAND)
            .map((o) => ({ lo: o.c[1] - o.h[1], hi: o.c[1] + o.h[1] }))
          // Snap to the equal-gap centre when grid-snap is off and the axis wasn't
          // already claimed by a stronger edge/centre alignment snap. Then re-detect
          // at the final position so the rendered badges read the post-snap gaps.
          if (!state.snapEnabled && !sx) {
            const s = detectEqualSpacingAxis('x', next[0], dh[0], xOthers, wf.x, {
              tol: SPACING_TH,
            })
            if (s?.snapCenter != null) next = [s.snapCenter, next[1]]
          }
          if (!state.snapEnabled && !sz) {
            const s = detectEqualSpacingAxis('z', next[1], dh[1], zOthers, wf.z, {
              tol: SPACING_TH,
            })
            if (s?.snapCenter != null) next = [next[0], s.snapCenter]
          }
          const esx = detectEqualSpacingAxis('x', next[0], dh[0], xOthers, wf.x, {
            tol: SPACING_TH,
          })
          const esz = detectEqualSpacingAxis('z', next[1], dh[1], zOthers, wf.z, {
            tol: SPACING_TH,
          })
          if (esx) spacings.push(esx)
          if (esz) spacings.push(esz)
        }
      }
      state.setDragGuides(guides)
      state.setDragSpacings(spacings)

      // Snug-stacking candidate (single-item drag only): if the dragged item's
      // centre lands over a compatible base item's footprint, flag that base
      // for a highlight + a snap commit on release. Otherwise behave as a
      // normal free drag.
      let snap: FurnitureItem | null = null
      if (group.length <= 1) {
        const draggedItem = itemsById.get(id)
        const draggedDef = draggedItem ? catalogRef.current[draggedItem.defId] : undefined
        if (draggedItem && draggedDef) {
          // Only an item whose footprint AABB contains the drop point can host the
          // snug-stack — query the grid for those instead of scanning the scene
          // (the grid excludes the dragged item, so no self-check is needed).
          const nearIds = queryRect(broadphase.grid, {
            minX: next[0],
            maxX: next[0],
            minZ: next[1],
            maxZ: next[1],
          })
          for (const cid of nearIds) {
            const cand = itemsById.get(cid)
            if (!cand) continue
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
      // Broadphase (PERF-003): collision only happens between items whose footprint
      // AABBs overlap, so restrict canPlace's neighbour set to the union of the
      // moved items' grid neighbourhoods. The static grid already excludes the
      // moved/in-group items (so in-group pairs are skipped, as before) and the
      // dragged item itself; a non-overlapping AABB can't have an overlapping OBB,
      // so this is result-equivalent to scanning the whole scene.
      const neighbourIds = new Set<string>()
      for (const mid of movedIds) {
        const item = afterById.get(mid)
        const def = item ? catalogRef.current[item.defId] : null
        if (!item || !def) continue
        const [mhx, mhz] = halfExtents(item, def)
        for (const nid of queryRect(broadphase.grid, {
          minX: item.position[0] - mhx,
          maxX: item.position[0] + mhx,
          minZ: item.position[1] - mhz,
          maxZ: item.position[1] + mhz,
        })) {
          neighbourIds.add(nid)
        }
      }
      const others = broadphase.staticItems.filter((it) => neighbourIds.has(it.id))
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
      // Drop ends the gesture — invalidate the broadphase cache so the next drag
      // (or a between-drags edit elsewhere) rebuilds the grid from fresh state.
      dragGridRef.current = null
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
      } else if (state.dragGroupOriginals.length <= 1) {
        // Surface-drop magnetism (PC2-SURFACE-DROP): a single surface item (one
        // that rests on a surface — carries a numeric `surfaceHeight`) dropped
        // over a table/shelf snaps its rest height onto that surface's top, so
        // decor sits on whatever you drop it on. No support under it → leave the
        // height as-is. Committed via setItems (no extra history push) so it rides
        // the drag's single startDrag snapshot.
        const cur = useStore.getState()
        const dropped = cur.items.find((i) => i.id === id)
        const def = dropped ? catalogRef.current[dropped.defId] : undefined
        const sh = dropped?.props['surfaceHeight']
        if (dropped && def && typeof sh === 'number') {
          const top = resolveSurfaceDropHeight(
            dropped.position[0],
            dropped.position[1],
            cur.items,
            catalogRef.current,
            id,
            dropped.levelId,
          )
          if (top != null && Math.abs(top - sh) > 1e-3) {
            cur.setItems(
              cur.items.map((it) =>
                it.id === id ? { ...it, props: { ...it.props, surfaceHeight: top } } : it,
              ),
            )
          }
        }
      }
      state.endDrag()
      // A click that didn't actually move/snap anything still pushed a history
      // snapshot in startDrag — drop it so the user's first undo isn't a dead
      // no-op step (BUG-016). A real drag changed an array reference, so this is
      // a no-op there.
      useStore.getState().dropRedundantHistory()
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
