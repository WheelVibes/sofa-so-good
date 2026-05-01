import { FLAT, ROOMS, WALLS } from '../../apartment/constants';
import { wallBordersRoom } from '../../apartment/daylight';
import type { RoomId } from '../../apartment/types';

export interface RoomPose {
  x: number;
  y: number;
  z: number;
}

export interface WallInjector {
  position: [number, number, number];
  target: [number, number, number];
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
  for (const wall of WALLS) {
    if (!wallBordersRoom(wall, id)) continue;
    const windows = wall.cutouts.filter((c) => c.kind === 'window');
    if (windows.length === 0) continue;
    const [sx, sz] = wall.start;
    const [ex, ez] = wall.end;
    const dx = ex - sx;
    const dz = ez - sz;
    const len = Math.hypot(dx, dz);
    if (len < EPS) continue;
    const mx = (sx + ex) / 2;
    const mz = (sz + ez) / 2;
    const nA: [number, number] = [-dz / len, dx / len];
    const toCx = cx - mx;
    const toCz = cz - mz;
    const dot = nA[0] * toCx + nA[1] * toCz;
    const inward: [number, number] = dot >= 0 ? nA : [-nA[0], -nA[1]];
    const half = wall.thickness === 'external'
      ? FLAT.externalWallThickness / 2
      : FLAT.internalWallThickness / 2;
    const winMidY = (FLAT.bedroomWindowSill + FLAT.windowHeadHeight) / 2;
    const offset = half + 0.05;
    out.push({
      position: [mx - inward[0] * offset, winMidY, mz - inward[1] * offset],
      target: [cx, winMidY, cz],
    });
  }
  return out;
}
