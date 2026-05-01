// src/apartment/roomGraph.ts
import { DOORS, FLAT, ROOMS, WALLS } from './constants';
import type { DoorState } from '../state/slices/doorsSlice';
import type { RoomDef, RoomId, WallSpec } from './types';

export const BLEED_ATTENUATION = 0.4;
export const BLEED_MAX_PASSES = 4;

export interface RoomEdge {
  neighbour: RoomId;
  doorId: string;
  open: boolean;
}
export interface RoomGraph {
  edges: Record<RoomId, RoomEdge[]>;
}

const ALL_ROOM_IDS: RoomId[] = Object.keys(ROOMS) as RoomId[];
const EPS = 1e-3;

function emptyEdgeMap(): Record<RoomId, RoomEdge[]> {
  const out = {} as Record<RoomId, RoomEdge[]>;
  for (const id of ALL_ROOM_IDS) out[id] = [];
  return out;
}

/**
 * Check whether the 1D point `p` falls within [lo-eps, hi+eps].
 */
function inRange(p: number, lo: number, hi: number): boolean {
  return p >= lo - EPS && p <= hi + EPS;
}

/**
 * Returns true if the given point (px, pz) lies inside the room's interior
 * bounding box (including extension for L-shaped rooms).
 */
function pointInRoom(px: number, pz: number, r: RoomDef): boolean {
  const x0 = r.origin[0];
  const z0 = r.origin[1];
  const x1 = x0 + r.width;
  const z1 = z0 + r.depth;
  if (inRange(px, x0, x1) && inRange(pz, z0, z1)) return true;
  if (r.extension) {
    const ex0 = r.origin[0] + r.extension.offset[0];
    const ez0 = r.origin[1] + r.extension.offset[1];
    const ex1 = ex0 + r.extension.width;
    const ez1 = ez0 + r.extension.depth;
    if (inRange(px, ex0, ex1) && inRange(pz, ez0, ez1)) return true;
  }
  return false;
}

/**
 * Find the two rooms connected by a door.
 * Uses the door's midpoint along the wall and checks which rooms contain
 * that point offset slightly to each side of the wall.
 */
function roomsAdjacentToDoor(
  wall: WallSpec,
  doorOffset: number,
  doorWidth: number,
): [RoomId, RoomId] | null {
  const [sx, sz] = wall.start;
  const [ex, ez] = wall.end;
  const len = Math.hypot(ex - sx, ez - sz);
  if (len < EPS) return null;
  const dx = (ex - sx) / len;
  const dz = (ez - sz) / len;
  // Door midpoint along the wall
  const mid = doorOffset + doorWidth / 2;
  const mx = sx + dx * mid;
  const mz = sz + dz * mid;
  // Perpendicular offset (half-thickness push into each side)
  const half =
    wall.thickness === 'external'
      ? FLAT.externalWallThickness / 2
      : FLAT.internalWallThickness / 2;
  const nx = -dz; // perpendicular
  const nz = dx;
  const probe = half + EPS * 5;

  const sideA: RoomId[] = [];
  const sideB: RoomId[] = [];
  for (const id of ALL_ROOM_IDS) {
    const r = ROOMS[id];
    if (pointInRoom(mx + nx * probe, mz + nz * probe, r)) sideA.push(id);
    if (pointInRoom(mx - nx * probe, mz - nz * probe, r)) sideB.push(id);
  }
  if (sideA.length === 1 && sideB.length === 1 && sideA[0] !== sideB[0]) {
    return [sideA[0], sideB[0]];
  }
  return null;
}

export function buildRoomGraph(doorState: Record<string, DoorState>): RoomGraph {
  const edges = emptyEdgeMap();
  for (const door of DOORS) {
    const wall = WALLS.find((w) => w.id === door.wallId);
    if (!wall) continue;
    const pair = roomsAdjacentToDoor(wall, door.offset, door.width);
    if (!pair) continue;
    const [a, b] = pair;
    const open = doorState[door.id]?.open ?? door.defaultOpen;
    edges[a].push({ neighbour: b, doorId: door.id, open });
    edges[b].push({ neighbour: a, doorId: door.id, open });
  }
  return { edges };
}

export function relaxDaylight(
  base: Record<RoomId, number>,
  graph: RoomGraph,
): Record<RoomId, number> {
  const out = { ...base };
  for (let pass = 0; pass < BLEED_MAX_PASSES; pass++) {
    let changed = false;
    for (const r of ALL_ROOM_IDS) {
      let best = out[r];
      for (const e of graph.edges[r]) {
        if (!e.open) continue;
        const cand = out[e.neighbour] * BLEED_ATTENUATION;
        if (cand > best) best = cand;
      }
      if (best > out[r] + 1e-6) {
        out[r] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}
