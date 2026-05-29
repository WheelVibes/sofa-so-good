/**
 * Placement collision orchestrator.
 *
 * Decides whether a candidate furniture item — given its def and the
 * current door + items state — fits the apartment without clipping a
 * wall or another item. Reuses:
 *   - OBB math from ./obb.ts
 *   - door-aware wall segments from ./wallsFromState.ts
 *   - the cached GLB footprint from ../furniture/GltfModel.ts
 */

import type { FurnitureDef, FurnitureItem } from '../furniture/types';
import { getCachedGltfFootprint } from '../furniture/GltfModel';
import { obbVsObb, type OBB } from './obb';
import { buildCollisionWalls } from './wallsFromState';
import type { CollisionWall } from './walls';

/** Convert a thick wall segment to an OBB so OBB-vs-OBB SAT can detect
 *  furniture poking into the wall *body*, not just past its centerline. */
function wallToObb(w: CollisionWall): OBB {
  const dx = w.bx - w.ax;
  const dz = w.bz - w.az;
  const length = Math.hypot(dx, dz);
  return {
    cx: (w.ax + w.bx) / 2,
    cz: (w.az + w.bz) / 2,
    hx: length / 2,
    hz: w.thickness / 2,
    rot: Math.atan2(dz, dx),
  };
}

/** Returns the OBB footprint of an item using the def's defaultFootprint
 *  modified by parametric overrides where the schema exposes them. */
export function itemFootprint(item: FurnitureItem, def: FurnitureDef): OBB {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;
  // Local-space center offset of the GLB bbox. Many models are authored
  // off-origin; without this the OBB drifts from the rendered geometry.
  let ox = 0;
  let oz = 0;

  if (def.kind === 'parametric') {
    // Recompute footprint from live params using the def's mapping; falls
    // back to the standard 'width' / 'depth' keys.
    const map = def.footprintParams ?? {};
    const wKey = map.w ?? 'width';
    const dKey = map.d ?? 'depth';
    const wv = item.props[wKey];
    const dv = item.props[dKey];
    if (typeof wv === 'number') w = wv;
    if (typeof dv === 'number') d = dv;
  } else {
    // For any GLB-backed def (builtin / user upload / remote / pack),
    // prefer the cached real bounding box over the def's authored
    // defaultFootprint — uploads default to a 1×1×1 placeholder, and
    // remote/pack entries may be inaccurate too.
    const url = def.source === 'builtin' ? def.url : def.runtimeUrl;
    const cached = url ? getCachedGltfFootprint(url) : null;
    if (cached) {
      w = cached.w;
      d = cached.d;
      ox = cached.ox;
      oz = cached.oz;
    }
  }

  const defScale = def.kind === 'parametric' ? undefined : def.scale;
  const scale =
    (typeof item.props['scale'] === 'number' ? item.props['scale'] : defScale) ?? 1;
  const cos = Math.cos(item.rotation);
  const sin = Math.sin(item.rotation);
  const sx = ox * scale;
  const sz = oz * scale;

  return {
    cx: item.position[0] + cos * sx - sin * sz,
    cz: item.position[1] + sin * sx + cos * sz,
    hx: (w * scale) / 2,
    hz: (d * scale) / 2,
    rot: item.rotation,
  };
}

interface PlacementContext {
  others: FurnitureItem[];
  defs: Record<string, FurnitureDef>;
  doors: Record<string, { open: boolean }>;
}

/** Vertical extent of an item in metres above the floor, for height-aware
 *  collision. Falls back to [0, footprint height]. */
function verticalSpan(def: FurnitureDef): { base: number; top: number } {
  return def.verticalSpan ?? { base: 0, top: def.defaultFootprint.h };
}

/** True iff two vertical spans overlap (touching edges don't count). */
function spansOverlap(
  a: { base: number; top: number },
  b: { base: number; top: number },
): boolean {
  return a.base < b.top - 1e-6 && b.base < a.top - 1e-6;
}

/** Returns true iff `item` can be placed without overlapping a (closed-door-
 *  aware) wall segment or any other item. The candidate item's id is
 *  ignored when scanning `others`, so this also works for "can the item
 *  stay where it is after a transform?" checks. */
export function canPlace(
  item: FurnitureItem,
  def: FurnitureDef,
  ctx: PlacementContext,
): boolean {
  // Flat floor coverings (rugs) sit under everything and never collide.
  if (def.noClip) return true;

  const obb = itemFootprint(item, def);

  // Walls — tested as full-thickness OBBs so an item placed flush
  // against the visible interior face still has to clear the wall body.
  // Mounted items (wall aircon, ceiling lights) are exempt.
  if (!def.mounted) {
    const walls = buildCollisionWalls(ctx.doors);
    for (const seg of walls) {
      if (obbVsObb(obb, wallToObb(seg))) return false;
    }
  }

  // Other furniture — height-aware: only collide when the 2D footprints
  // overlap AND the vertical spans intersect, so a pendant can hang over a
  // table or a wall unit sit above a wardrobe.
  const span = verticalSpan(def);
  for (const other of ctx.others) {
    if (other.id === item.id) continue;
    const oDef = ctx.defs[other.defId];
    if (!oDef) continue;
    if (oDef.noClip) continue;
    if (!spansOverlap(span, verticalSpan(oDef))) continue;
    if (obbVsObb(obb, itemFootprint(other, oDef))) return false;
  }

  return true;
}
