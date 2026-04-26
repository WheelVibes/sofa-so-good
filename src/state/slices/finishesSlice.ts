import type { SliceCreator } from './types';
import type { RootState } from '../store';
import { ROOMS } from '../../apartment/constants';
import type { RoomId } from '../../apartment/types';
import {
  DEFAULT_FLOOR,
  DEFAULT_WALL,
} from '../../materials/builtinCatalog';
import type { MaterialId } from '../../materials/types';

/** Per-room finish picks — separate maps for floor and wall surfaces.
 *  AC ledge is external and not finishable; entries are seeded for
 *  every interior room so picker UIs never have to deal with absent
 *  keys. */
export interface FinishesSlice {
  finishes: {
    floor: Record<RoomId, MaterialId>;
    walls: Record<RoomId, MaterialId>;
  };
  setFloorFinish: (room: RoomId, id: MaterialId) => void;
  setWallFinish: (room: RoomId, id: MaterialId) => void;
}

function initialMap(material: MaterialId): Record<RoomId, MaterialId> {
  const out = {} as Record<RoomId, MaterialId>;
  for (const id of Object.keys(ROOMS) as RoomId[]) out[id] = material;
  return out;
}

export const FINISHES_INITIAL: Pick<FinishesSlice, 'finishes'> = {
  finishes: {
    floor: initialMap(DEFAULT_FLOOR),
    walls: initialMap(DEFAULT_WALL),
  },
};

export const createFinishesSlice: SliceCreator<FinishesSlice, RootState> = (set) => ({
  ...FINISHES_INITIAL,
  setFloorFinish: (room, id) =>
    set((s) => ({
      finishes: {
        ...s.finishes,
        floor: { ...s.finishes.floor, [room]: id },
      },
    })),
  setWallFinish: (room, id) =>
    set((s) => ({
      finishes: {
        ...s.finishes,
        walls: { ...s.finishes.walls, [room]: id },
      },
    })),
});
