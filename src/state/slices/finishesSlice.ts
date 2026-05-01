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
 *  keys.
 *
 *  `lastSurface` remembers which surface tab the user most recently
 *  edited in `FinishPicker`, so the remote-browse → resolve flow can
 *  default-apply to the same surface across sessions. */
export type Surface = 'floor' | 'wall';

export interface FinishesSlice {
  finishes: {
    floor: Record<RoomId, MaterialId>;
    walls: Record<RoomId, MaterialId>;
  };
  lastSurface: Surface;
  setFloorFinish: (room: RoomId, id: MaterialId) => void;
  setWallFinish: (room: RoomId, id: MaterialId) => void;
  setLastSurface: (surface: Surface) => void;
}

function initialMap(material: MaterialId): Record<RoomId, MaterialId> {
  const out = {} as Record<RoomId, MaterialId>;
  for (const id of Object.keys(ROOMS) as RoomId[]) out[id] = material;
  return out;
}

export const FINISHES_INITIAL: Pick<FinishesSlice, 'finishes' | 'lastSurface'> = {
  finishes: {
    floor: initialMap(DEFAULT_FLOOR),
    walls: initialMap(DEFAULT_WALL),
  },
  lastSurface: 'floor',
};

export const createFinishesSlice: SliceCreator<FinishesSlice, RootState> = (set, get) => ({
  ...FINISHES_INITIAL,
  setFloorFinish: (room, id) => {
    get().pushHistory();
    set((s) => ({
      finishes: {
        ...s.finishes,
        floor: { ...s.finishes.floor, [room]: id },
      },
      lastSurface: 'floor',
    }));
  },
  setWallFinish: (room, id) => {
    get().pushHistory();
    set((s) => ({
      finishes: {
        ...s.finishes,
        walls: { ...s.finishes.walls, [room]: id },
      },
      lastSurface: 'wall',
    }));
  },
  setLastSurface: (surface) => set({ lastSurface: surface }),
});
