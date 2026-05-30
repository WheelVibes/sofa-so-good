import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { useStore } from '../state/store';
import { useCatalog } from '../furniture/catalog';
import { canPlace } from '../collision/placement';
import { buildCollisionWalls } from '../collision/wallsFromState';
import { nearestWallGap } from '../collision/clearanceGap';
import { planCollisionWalls, isDefaultPlan } from '../floorplan/planGeometry';
import { snapToGrid } from './snap';

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const ALIGN_TH = 0.1; // alignment snap threshold (m)

/** Axis-aligned half-extents [hx, hz] of an item's footprint at its rotation. */
function halfExtents(item: { rotation: number; props: Record<string, unknown> }, def: import('../furniture/types').FurnitureDef): [number, number] {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {};
    const wv = item.props[map.w ?? 'width'];
    const dv = item.props[map.d ?? 'depth'];
    if (typeof wv === 'number') w = wv;
    if (typeof dv === 'number') d = dv;
  }
  const c = Math.abs(Math.cos(item.rotation));
  const s = Math.abs(Math.sin(item.rotation));
  return [(c * w + s * d) / 2, (s * w + c * d) / 2];
}

/** Best 1-D snap of a dragged centre (half-extent `dh`) to others' centres and
 *  edges — centre-align, edge-align, or butt-adjacent. Returns the snapped
 *  centre + the guide-line coordinate, or null if nothing's within threshold. */
function snapAxis(
  center: number,
  dh: number,
  others: Array<{ c: number; h: number }>,
): { center: number; guide: number } | null {
  let best: { center: number; guide: number; d: number } | null = null;
  for (const o of others) {
    const cands: Array<{ center: number; guide: number }> = [
      { center: o.c, guide: o.c }, // centres aligned
      { center: o.c - o.h + dh, guide: o.c - o.h }, // near edges aligned
      { center: o.c + o.h - dh, guide: o.c + o.h }, // far edges aligned
      { center: o.c - o.h - dh, guide: o.c - o.h }, // butt against o's near side
      { center: o.c + o.h + dh, guide: o.c + o.h }, // butt against o's far side
    ];
    for (const cand of cands) {
      const d = Math.abs(cand.center - center);
      if (d < ALIGN_TH && (!best || d < best.d)) best = { ...cand, d };
    }
  }
  return best;
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
  const { camera, gl } = useThree();
  const catalog = useCatalog();
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const ndc = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const target = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const dom = gl.domElement;

    const project = (clientX: number, clientY: number): [number, number] | null => {
      const rect = dom.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1),
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, target);
      if (!hit) return null;
      return [target.x, target.z];
    };

    const onMove = (ev: PointerEvent) => {
      const state = useStore.getState();
      const id = state.draggingItemId;
      if (!id) return;
      const hit = project(ev.clientX, ev.clientY);
      if (!hit) return;
      const [hx, hz] = hit;
      const [ox, oz] = state.dragOffset;
      let next: [number, number] = [hx - ox, hz - oz];
      // Snap to the alignment grid when enabled (precise placement).
      if (state.snapEnabled) next = snapToGrid(next, state.gridSize);

      const group = state.dragGroupOriginals;
      // Smart alignment guides: for a single-item drag, snap centres AND edges
      // to nearby items (line up rows / butt pieces together), surfacing guide
      // lines. Edge + adjacency candidates make pieces sit flush.
      const guides: Array<{ axis: 'x' | 'z'; value: number }> = [];
      if (group.length <= 1) {
        const dragDef = catalogRef.current[state.items.find((i) => i.id === id)?.defId ?? ''];
        const dragItem = state.items.find((i) => i.id === id);
        if (dragDef && dragItem) {
          const dh = halfExtents(dragItem, dragDef);
          const others = state.items
            .filter((i) => i.id !== id && catalogRef.current[i.defId])
            .map((i) => ({ c: i.position, h: halfExtents(i, catalogRef.current[i.defId]) }));
          const sx = snapAxis(next[0], dh[0], others.map((o) => ({ c: o.c[0], h: o.h[0] })));
          const sz = snapAxis(next[1], dh[1], others.map((o) => ({ c: o.c[1], h: o.h[1] })));
          if (sx) {
            next = [sx.center, next[1]];
            guides.push({ axis: 'x', value: sx.guide });
          }
          if (sz) {
            next = [next[0], sz.center];
            guides.push({ axis: 'z', value: sz.guide });
          }
        }
      }
      state.setDragGuides(guides);

      if (group.length > 1 && state.dragOriginal) {
        // Translate every group member by the same delta as the anchor.
        const dx = next[0] - state.dragOriginal.position[0];
        const dz = next[1] - state.dragOriginal.position[1];
        for (const orig of group) {
          state.moveItem(orig.id, [orig.position[0] + dx, orig.position[1] + dz]);
        }
      } else {
        state.moveItem(id, next);
      }

      // Re-read state so freshly-moved items are included in canPlace.
      const after = useStore.getState();
      const movedIds = group.length > 1 ? group.map((g) => g.id) : [id];
      // For group drags, ignore in-group pairs when checking collisions —
      // their relative positions don't change, so any pair-wise overlap
      // would have existed at drag-start. Walls and unselected items
      // still apply.
      const inGroup = new Set(movedIds);
      const others = group.length > 1 ? after.items.filter((it) => !inGroup.has(it.id)) : after.items;
      // On a user-authored plan, collide against its walls (not the fixed flat).
      const planWalls = isDefaultPlan(after.floorPlan)
        ? undefined
        : planCollisionWalls(after.floorPlan, after.doors);
      let valid = true;
      for (const mid of movedIds) {
        const item = after.items.find((i) => i.id === mid);
        const def = item ? catalogRef.current[item.defId] : null;
        if (!item || !def) continue;
        if (
          !canPlace(item, def, {
            others,
            defs: catalogRef.current,
            doors: after.doors,
            walls: planWalls,
          })
        ) {
          valid = false;
          break;
        }
      }
      if (valid !== after.dragValid) state.setDragValid(valid);

      // Live wall-clearance readout for a single-item drag.
      if (group.length <= 1) {
        const item = after.items.find((i) => i.id === id);
        const def = item ? catalogRef.current[item.defId] : null;
        if (item && def) {
          const [hx, hz] = halfExtents(item, def);
          const box = {
            x0: item.position[0] - hx,
            z0: item.position[1] - hz,
            x1: item.position[0] + hx,
            z1: item.position[1] + hz,
          };
          const walls = planWalls ?? buildCollisionWalls(after.doors);
          state.setDragClearance(nearestWallGap(box, walls));
        }
      }
    };

    const onUp = () => {
      const state = useStore.getState();
      const id = state.draggingItemId;
      if (!id) return;
      if (!state.dragValid) {
        const group = state.dragGroupOriginals;
        if (group.length > 1) {
          for (const orig of group) {
            state.moveItem(orig.id, orig.position);
            state.rotateItem(orig.id, orig.rotation);
          }
        } else if (state.dragOriginal) {
          state.moveItem(id, state.dragOriginal.position);
          state.rotateItem(id, state.dragOriginal.rotation);
        }
      }
      state.endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [camera, gl, ndc, raycaster, target]);

  return null;
}
