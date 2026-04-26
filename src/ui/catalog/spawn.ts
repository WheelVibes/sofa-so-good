import { ROOMS } from '../../apartment/constants';
import { roomCentroid } from '../../apartment/rooms';
import { canPlace } from '../../collision/placement';
import type { FurnitureDef, FurnitureItem, ParamProps } from '../../furniture/types';
import { defaultParamProps } from '../../furniture/types';
import { useStore } from '../../state/store';

const SPAWN_GRID_STEP = 0.4;
const SPAWN_GRID_RADIUS = 4;

function defaultProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def);
  return def.scale != null ? { scale: def.scale } : {};
}

/** Picks a placement near the centre of the largest room (livingDining)
 *  by scanning a grid until canPlace returns true. Returns null if no
 *  spot is found within the search radius. */
function findSpawnSpot(
  def: FurnitureDef,
  catalog: Record<string, FurnitureDef>,
): [number, number] | null {
  const [cx, cz] = roomCentroid('livingDining');
  const state = useStore.getState();
  const candidate: FurnitureItem = {
    id: 'spawn-probe',
    defId: def.id,
    position: [cx, cz],
    rotation: 0,
    props: defaultProps(def),
  };

  // Spiral outwards in 0.4 m steps so the new item lands as close as
  // possible to the room centre without clipping anything.
  for (let r = 0; r <= SPAWN_GRID_RADIUS; r += SPAWN_GRID_STEP) {
    for (let dx = -r; dx <= r; dx += SPAWN_GRID_STEP) {
      for (const dz of r === 0 ? [0] : [-r, r]) {
        candidate.position = [cx + dx, cz + dz];
        if (canPlace(candidate, def, { others: state.items, defs: catalog, doors: state.doors })) {
          return candidate.position;
        }
      }
      if (r === 0) break;
    }
    for (let dz = -r + SPAWN_GRID_STEP; dz <= r - SPAWN_GRID_STEP; dz += SPAWN_GRID_STEP) {
      for (const dx of [-r, r]) {
        candidate.position = [cx + dx, cz + dz];
        if (canPlace(candidate, def, { others: state.items, defs: catalog, doors: state.doors })) {
          return candidate.position;
        }
      }
    }
  }
  return null;
}

/** Spawns an item from a catalog def at the first valid grid position
 *  near the L/D centre. Returns the new item's id, or null if no spot
 *  was free. Reads ROOMS for the centre via the apartment module — no
 *  hardcoded coordinates. */
export function spawnFromDef(
  def: FurnitureDef,
  catalog: Record<string, FurnitureDef>,
): string | null {
  // Defensive: the apartment module is the single source of truth.
  if (!ROOMS.livingDining) return null;
  const spot = findSpawnSpot(def, catalog);
  if (!spot) return null;
  return useStore.getState().addItem({
    defId: def.id,
    position: spot,
    rotation: def.defaultRotation ?? 0,
    props: defaultProps(def),
  });
}
