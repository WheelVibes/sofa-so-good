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
import { obbVsObb, obbVsSegment, type OBB } from './obb';
import { buildCollisionWalls } from './wallsFromState';

/** Returns the OBB footprint of an item using the def's defaultFootprint
 *  modified by parametric overrides where the schema exposes them. */
export function itemFootprint(item: FurnitureItem, def: FurnitureDef): OBB {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;

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
  } else if (def.source === 'builtin') {
    const cached = getCachedGltfFootprint(def.url);
    if (cached) {
      w = cached.w;
      d = cached.d;
    }
  }

  return {
    cx: item.position[0],
    cz: item.position[1],
    hx: w / 2,
    hz: d / 2,
    rot: item.rotation,
  };
}

interface PlacementContext {
  others: FurnitureItem[];
  defs: Record<string, FurnitureDef>;
  doors: Record<string, { open: boolean }>;
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
  const obb = itemFootprint(item, def);

  // Walls
  const walls = buildCollisionWalls(ctx.doors);
  for (const seg of walls) {
    if (obbVsSegment(obb, seg)) return false;
  }

  // Other furniture
  for (const other of ctx.others) {
    if (other.id === item.id) continue;
    const oDef = ctx.defs[other.defId];
    if (!oDef) continue;
    if (obbVsObb(obb, itemFootprint(other, oDef))) return false;
  }

  return true;
}
