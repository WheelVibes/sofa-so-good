import { FLAT, ROOMS } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';

export interface RoomPose {
  x: number;
  y: number;
  z: number;
}

export function roomCentroidPose(id: RoomId): RoomPose {
  const r = ROOMS[id];
  const ceiling = r.ceilingHeight ?? FLAT.ceilingHeight;
  return {
    x: r.origin[0] + r.width / 2,
    z: r.origin[1] + r.depth / 2,
    y: Math.max(0.5, ceiling - 0.2),
  };
}
