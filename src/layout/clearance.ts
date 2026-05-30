/**
 * Clearance checks: flag furniture that blocks a door opening's swing zone.
 * Pure + testable; used by the in-app "Checks" overlay. Door swing rectangles
 * are derived from the active floor plan's door openings (works for the seeded
 * default flat and user-authored plans alike).
 */
import type { FloorPlan } from '../floorplan/types';
import { wallLength } from '../floorplan/types';
import type { FurnitureDef, FurnitureItem } from '../furniture/types';

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Keep-clear rectangle in front of each door (both sides of the wall). */
export function doorSwingRects(plan: FloorPlan): Rect[] {
  const rects: Rect[] = [];
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const len = wallLength(wall);
    if (len === 0) continue;
    const ux = (wall.end[0] - wall.start[0]) / len;
    const uz = (wall.end[1] - wall.start[1]) / len;
    const nx = -uz;
    const nz = ux;
    const depth = Math.max(o.width, 0.6); // swing reach
    const a = o.offset;
    const b = o.offset + o.width;
    const pts: Array<[number, number]> = [];
    for (const s of [a, b]) {
      for (const d of [-depth, depth]) {
        pts.push([wall.start[0] + ux * s + nx * d, wall.start[1] + uz * s + nz * d]);
      }
    }
    rects.push({
      x0: Math.min(...pts.map((p) => p[0])),
      z0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      z1: Math.max(...pts.map((p) => p[1])),
    });
  }
  return rects;
}

/** Footprint AABB of an item (accounts for rotation + parametric size). */
function footprintAabb(item: FurnitureItem, def: FurnitureDef): Rect {
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
  const hx = (c * w + s * d) / 2;
  const hz = (s * w + c * d) / 2;
  return { x0: item.position[0] - hx, z0: item.position[1] - hz, x1: item.position[0] + hx, z1: item.position[1] + hz };
}

function contains(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/**
 * Probe points directly in front of each door opening (centre line, both
 * sides). An item whose footprint covers one is squarely in the doorway path
 * — a real blocker — unlike an item merely beside the door.
 */
export function doorProbePoints(plan: FloorPlan): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const o of plan.openings) {
    if (o.kind !== 'door') continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const len = wallLength(wall);
    if (len === 0) continue;
    const ux = (wall.end[0] - wall.start[0]) / len;
    const uz = (wall.end[1] - wall.start[1]) / len;
    const nx = -uz;
    const nz = ux;
    const cx = wall.start[0] + ux * (o.offset + o.width / 2);
    const cz = wall.start[1] + uz * (o.offset + o.width / 2);
    for (const d of [-0.42, -0.28, 0.28, 0.42]) {
      pts.push([cx + nx * d, cz + nz * d]);
    }
  }
  return pts;
}

/**
 * Ids of floor-standing items sitting directly in a door's path. Mounted items
 * (wall/ceiling) and noClip floor coverings (rugs) are exempt.
 */
export function blockedDoorItems(
  items: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  plan: FloorPlan,
): string[] {
  const probes = doorProbePoints(plan);
  if (probes.length === 0) return [];
  const flagged: string[] = [];
  for (const it of items) {
    const def = catalog[it.defId];
    if (!def || def.mounted || def.noClip) continue;
    const box = footprintAabb(it, def);
    if (probes.some((p) => contains(box, p[0], p[1]))) flagged.push(it.id);
  }
  return flagged;
}
