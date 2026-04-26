import type { SliceCreator } from './types';
import type { RootState } from '../store';

export interface DoorState {
  open: boolean;
}

export interface DoorsSlice {
  doors: Record<string, DoorState>;
  nearbyDoorId: string | null;
  toggleDoor: (id: string) => void;
  setDoorOpen: (id: string, open: boolean) => void;
  setNearbyDoor: (id: string | null) => void;
}

export const DOORS_INITIAL: Pick<DoorsSlice, 'doors' | 'nearbyDoorId'> = {
  doors: {},
  nearbyDoorId: null,
};

export const createDoorsSlice: SliceCreator<DoorsSlice, RootState> = (set, get) => ({
  ...DOORS_INITIAL,
  toggleDoor: (id) => {
    get().pushHistory();
    set((s) => ({
      doors: { ...s.doors, [id]: { open: !(s.doors[id]?.open ?? false) } },
    }));
  },
  setDoorOpen: (id, open) => {
    get().pushHistory();
    set((s) => ({ doors: { ...s.doors, [id]: { open } } }));
  },
  setNearbyDoor: (id) =>
    set((s) => (s.nearbyDoorId === id ? s : { nearbyDoorId: id })),
});
