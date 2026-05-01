import { FLAT, ROOMS, WALLS } from '../../apartment/constants';
import { wallBordersRoom } from '../../apartment/daylight';
import type { RoomId } from '../../apartment/types';

export interface RoomPose {
  x: number;
  y: number;
  z: number;
}

export interface WallInjector {
  /** World position just *inside* the room, ~0.5 m past the wall midpoint at
   *  window mid-height. Modeled as a pointLight with `radius` distance falloff
   *  so the light is largely confined to the source room (three.js lights
   *  don't get blocked by walls without per-light shadow maps). */
  position: [number, number, number];
  /** Approximate distance falloff cutoff — sized to the source room's diagonal
   *  so the injector reaches the far wall but attenuates before bleeding into
   *  neighbouring rooms. */
  radius: number;
}

const EPS = 1e-3;

export function roomCentroidPose(id: RoomId): RoomPose {
  const r = ROOMS[id];
  const ceiling = r.ceilingHeight ?? FLAT.ceilingHeight;
  return {
    x: r.origin[0] + r.width / 2,
    z: r.origin[1] + r.depth / 2,
    y: Math.max(0.5, ceiling - 0.2),
  };
}

export function roomWindowedWallInjectors(id: RoomId): WallInjector[] {
  const r = ROOMS[id];
  if (r.external) return [];
  const cx = r.origin[0] + r.width / 2;
  const cz = r.origin[1] + r.depth / 2;
  const out: WallInjector[] = [];
  const winMidY = (FLAT.bedroomWindowSill + FLAT.windowHeadHeight) / 2;
  // Place the light ~0.5 m INSIDE the room from the window so it reads as
  // light entering through the wall. PointLight `distance` falloff sized to
  // the room's diagonal confines the light largely to the source room
  // (three.js lights don't get blocked by walls without per-light shadow maps).
  const inset = 0.5;
  const radius = Math.hypot(r.width, r.depth) * 1.1;
  for (const wall of WALLS) {
    if (!wallBordersRoom(wall, id)) continue;
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    const dx = ex - sx;
    const dz = ez - sz;
    const len = Math.hypot(dx, dz);
    if (len < EPS) continue;
    const ux = dx / len;
    const uz = dz / len;
    const nA: [number, number] = [-uz, ux];
    const toCx = cx - (sx + ex) / 2;
    const toCz = cz - (sz + ez) / 2;
    const inward: [number, number] = nA[0] * toCx + nA[1] * toCz >= 0
      ? nA
      : [-nA[0], -nA[1]];
    for (const cutout of wall.cutouts) {
      if (cutout.kind !== 'window') continue;
      const along = cutout.offset + cutout.width / 2;
      const wx = sx + ux * along;
      const wz = sz + uz * along;
      // Only emit injectors for windows whose centre lies in this room's footprint
      // (external walls may span multiple rooms — `wallBordersRoom` is true for
      // each, but each window belongs to exactly one).
      const px = wx + inward[0] * inset;
      const pz = wz + inward[1] * inset;
      if (px < r.origin[0] - EPS || px > r.origin[0] + r.width + EPS) continue;
      if (pz < r.origin[1] - EPS || pz > r.origin[1] + r.depth + EPS) continue;
      out.push({ position: [px, winMidY, pz], radius });
    }
  }
  return out;
}
