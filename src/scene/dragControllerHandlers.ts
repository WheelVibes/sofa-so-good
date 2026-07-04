/**
 * Window-level pointer handlers for the live furniture drag gesture, extracted
 * from `DragController` (TEST-7) so they can be unit-tested without mounting
 * an R3F `<Canvas>` (headless raycasting isn't reproducible — see
 * `docs/visual-verification-playbook.md`). `DragController` supplies the real
 * camera/raycaster-backed `project` fn; a test supplies a stub. Behaviour is
 * byte-for-byte the same as the inline listeners this replaced — this module
 * has no React/three imports of its own beyond types, and no logic changed.
 */
import type { SpatialGrid } from '../collision/broadphase'
import { buildGrid, queryRect } from '../collision/broadphase'
import { nearestWallGap, wallGapsPerSide } from '../collision/clearanceGap'
import {
  detectEqualSpacingAxis,
  type EqualSpacing,
  relevantWallFaces,
  type Span,
} from '../collision/equalSpacing'
import { canPlace } from '../collision/placement'
import { placementWalls } from '../collision/placementWalls'
import { resolveSurfaceDropHeight } from '../collision/surfaceDrop'
import { wallSnapOffset } from '../collision/wallSnap'
import { buildCollisionWalls } from '../collision/wallsFromState'
import { isIkeaDef } from '../furniture/catalog'
import { resolveCompatible } from '../furniture/ikea/compatibility'
import { combineOnto } from '../furniture/ikea/stacking'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { useStore } from '../state/store'
import {
  halfExtents,
  isActiveDragPointer,
  pointInFootprint,
  snapAxis,
  snapBase,
  staticAabbs,
  wallFaces,
} from './dragHelpers'
import { isCentreInsideRects } from './roomClamp'
import { getRoomEditorShell } from './roomEditorShell'
import { snapToGrid } from './snap'

const SPACING_TH = 0.08 // equal-spacing match tolerance (m)
const SPACING_BAND = 1.2 // only pair items within this band on the other axis (m)

/** Broadphase cache for the current pointer drag (PERF-003), keyed by the
 *  drag's moved-id signature — see `DragController`'s `dragGridRef`. */
export interface DragGridCache {
  key: string
  grid: SpatialGrid
  staticItems: FurnitureItem[]
}

/** Per-room editor footprint-rect cache — see `DragController`'s `roomBoundsRef`. */
export interface RoomBoundsCache {
  roomId: string
  rects: Array<{ x0: number; z0: number; x1: number; z1: number }>
}

export interface DragHandlerDeps {
  /** Screen (clientX, clientY) → floor-plane world (x, z), or null off-floor.
   *  `DragController` supplies the real camera raycast; tests stub it. */
  project: (clientX: number, clientY: number) => [number, number] | null
  /** Lazily-read catalog snapshot — mirrors `useCatalogGetter`'s ref. */
  catalogRef: { current: Record<string, FurnitureDef> }
  dragGridRef: { current: DragGridCache | null }
  roomBoundsRef: { current: RoomBoundsCache | null }
  snapBaseIdRef: { current: string | null }
  setSnap: (id: string | null) => void
}

/** Builds the `onMove`/`onUp` window-listener pair `DragController` registers
 *  for `pointermove`/`pointerup`/`pointercancel`. Pulled out verbatim so the
 *  orchestration (BUG-1 pointerId gating, snug-stack commit, invalid-release
 *  revert/soft-push, alignment + equal-spacing guides) is testable headlessly. */
export function createDragHandlers(deps: DragHandlerDeps) {
  const { project, catalogRef, dragGridRef, roomBoundsRef, snapBaseIdRef, setSnap } = deps

  const onMove = (ev: PointerEvent) => {
    let state = useStore.getState()
    const activeId = state.draggingItemId
    if (!activeId) return
    // BUG-1: a second finger's own pointermove stream must not drive this
    // drag — only the pointer that started it (state.dragPointerId) may.
    if (!isActiveDragPointer(state.dragPointerId, ev.pointerId)) return
    // FEAT-B (Alt-drag duplicate): the clone is created lazily, on this
    // FIRST real pointermove of the gesture — not at pointerdown — so a
    // plain Alt+click that never moves duplicates nothing (see
    // Furniture.onPointerDown / dragHelpers.shouldDuplicateOnDragStart).
    // Once resolved, draggingItemId/dragGroupOriginals point at the fresh
    // clone(s); re-read state so everything below (and every later
    // pointermove) drags the copy, leaving the original untouched.
    if (state.dragDuplicatePending) {
      state.resolveDragDuplicate()
      state = useStore.getState()
    }
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
        // Per-room editor: the piece may be dragged anywhere (no silent clamp
        // back inside) — leaving the room's placeable area instead marks the drag
        // invalid (red), handled in the validity pass below (bug #5/#6).
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
    // Per-room editor: a piece dragged outside the room's placeable rects is
    // invalid (bug #5) — cache the room shell rects here (keyed on room id) so
    // this runs cheaply every move. Empty/absent → no room-bounds constraint.
    let roomRects: Array<{ x0: number; z0: number; x1: number; z1: number }> = []
    if (after.roomEditor.active && after.roomEditor.roomId) {
      const rid = after.roomEditor.roomId
      if (roomBoundsRef.current?.roomId !== rid) {
        const sh = getRoomEditorShell(after.floorPlan, rid)
        roomBoundsRef.current = sh ? { roomId: rid, rects: sh.shell.rects } : null
      }
      roomRects = roomBoundsRef.current?.rects ?? []
    }
    let valid = true
    for (const mid of movedIds) {
      const item = afterById.get(mid)
      const def = item ? catalogRef.current[item.defId] : null
      if (!item || !def) continue
      const dh = halfExtents(item, def)
      if (
        !canPlace(item, def, {
          others,
          defs: catalogRef.current,
          doors: after.doors,
          walls: planWalls,
        }) ||
        !isCentreInsideRects(item.position[0], item.position[1], dh[0], dh[1], roomRects)
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

  const onUp = (ev: PointerEvent) => {
    const state = useStore.getState()
    const id = state.draggingItemId
    if (!id) {
      setSnap(null)
      return
    }
    // BUG-1: a second finger's release (or cancel) must not end THIS drag —
    // only the initiating pointer's up/cancel commits/reverts it. The first
    // finger is still down and dragging; ignore the other pointer entirely.
    if (!isActiveDragPointer(state.dragPointerId, ev.pointerId)) return
    // Drop ends the gesture — invalidate the broadphase cache so the next drag
    // (or a between-drags edit elsewhere) rebuilds the grid from fresh state.
    dragGridRef.current = null

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

    // Capture the pre-drag transform(s) before endDrag clears them — a valid
    // move that actually changed something becomes a pending tick/cross edit.
    const wasValid = state.dragValid
    const originals: Array<{ id: string; position: [number, number]; rotation: number }> =
      state.dragGroupOriginals.length > 1
        ? state.dragGroupOriginals.map((o) => ({
            id: o.id,
            position: o.position,
            rotation: o.rotation,
          }))
        : state.dragOriginal
          ? [
              {
                id,
                position: state.dragOriginal.position,
                rotation: state.dragOriginal.rotation,
              },
            ]
          : []

    // Bug #6: an invalid drop (collision / outside the room) NO LONGER snaps
    // back or auto-nudges — the item stays exactly where it was dropped and
    // resolves to a `blocked` pending edit (the tick/cross pill shows, but the
    // tick is disabled with a "can't be applied" tooltip until the user drags
    // it valid or cancels). Only a VALID free drop gets surface-drop magnetism.
    if (wasValid && state.dragGroupOriginals.length <= 1) {
      // Surface-drop magnetism (PC2-SURFACE-DROP): a single surface item (one
      // that rests on a surface — carries a numeric `surfaceHeight`) dropped
      // over a table/shelf snaps its rest height onto that surface's top, so
      // decor sits on whatever you drop it on. No support under it → leave the
      // height as-is. Committed via setItems (no extra history push) so it rides
      // the drag's single startDrag snapshot.
      const cur0 = useStore.getState()
      const dropped = cur0.items.find((i) => i.id === id)
      const def = dropped ? catalogRef.current[dropped.defId] : undefined
      const sh = dropped?.props['surfaceHeight']
      if (dropped && def && typeof sh === 'number') {
        const top = resolveSurfaceDropHeight(
          dropped.position[0],
          dropped.position[1],
          cur0.items,
          catalogRef.current,
          id,
          dropped.levelId,
        )
        if (top != null && Math.abs(top - sh) > 1e-3) {
          cur0.setItems(
            cur0.items.map((it) =>
              it.id === id ? { ...it, props: { ...it.props, surfaceHeight: top } } : it,
            ),
          )
        }
      }
    }
    // FEAT-B: captured BEFORE endDrag clears them — decides the cleanup
    // branch below for a duplicate whose copy never ends up anywhere
    // different from the original it was cloned from.
    const wasDuplicate = state.dragIsDuplicate
    const duplicateSources = state.dragDuplicateSourceIds
    state.endDrag()
    // Did anything actually move/rotate this gesture? Checked regardless of
    // validity now — an invalid drop that MOVED still resolves to a (blocked)
    // pill (bug #6); only a true no-op click (BUG-016) drops the dead snapshot.
    const cur = useStore.getState()
    const byId = new Map(cur.items.map((i) => [i.id, i]))
    const changed = originals.some((o) => {
      const it = byId.get(o.id)
      return (
        !!it &&
        (it.position[0] !== o.position[0] ||
          it.position[1] !== o.position[1] ||
          it.rotation !== o.rotation)
      )
    })
    if (changed) {
      // The gesture's pre-drag items array (top history snapshot) lets a cancel
      // restore every item by reference in one step. `blocked` (an invalid
      // drop) disables the confirm tick in `EditConfirmBar` until it's valid.
      const priorItems = cur.past[cur.past.length - 1]?.items
      cur.setPendingEdit({
        kind: 'transform',
        ids: originals.map((o) => o.id),
        originals,
        priorItems,
        blocked: !wasValid,
      })
    } else if (wasDuplicate) {
      // FEAT-B: a clone WAS created this gesture (dragDuplicatePending
      // resolved) but it landed nowhere different from the source — an
      // invalid drop reverted it above, or the release was a net-zero
      // move. Discard the copy entirely (restore the exact pre-duplicate
      // items/selection snapshot startDrag pushed) rather than leaving an
      // orphaned, un-undoable duplicate stacked on the original.
      const snap = cur.past[cur.past.length - 1]
      if (snap) {
        useStore.setState({
          items: snap.items,
          selectedItemIds: duplicateSources,
          selectedItemId: duplicateSources[duplicateSources.length - 1] ?? null,
        })
      }
      cur.dropRedundantHistory()
    } else {
      cur.dropRedundantHistory()
    }
  }

  return { onMove, onUp }
}
