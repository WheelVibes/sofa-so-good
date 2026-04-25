import { create } from 'zustand';

export type CameraMode = 'orbit' | 'firstPerson';
export type TimeOfDay = 'day' | 'dusk' | 'night';

interface DoorState {
  open: boolean;
}

interface State {
  cameraMode: CameraMode;
  timeOfDay: TimeOfDay;
  showMeasurements: boolean;
  doors: Record<string, DoorState>;
  nearbyDoorId: string | null;

  setCameraMode: (m: CameraMode) => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  cycleTimeOfDay: () => void;
  toggleMeasurements: () => void;
  toggleDoor: (id: string) => void;
  setDoorOpen: (id: string, open: boolean) => void;
  setNearbyDoor: (id: string | null) => void;
  __resetForTest: () => void;
}

const INITIAL: Pick<
  State,
  'cameraMode' | 'timeOfDay' | 'showMeasurements' | 'doors' | 'nearbyDoorId'
> = {
  cameraMode: 'orbit',
  timeOfDay: 'day',
  showMeasurements: false,
  doors: {},
  nearbyDoorId: null,
};

export const useStore = create<State>((set) => ({
  ...INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
  setTimeOfDay: (t) => set({ timeOfDay: t }),
  cycleTimeOfDay: () =>
    set((s) => {
      const order: TimeOfDay[] = ['day', 'dusk', 'night'];
      const next = order[(order.indexOf(s.timeOfDay) + 1) % order.length];
      return { timeOfDay: next };
    }),
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  toggleDoor: (id) =>
    set((s) => ({
      doors: { ...s.doors, [id]: { open: !(s.doors[id]?.open ?? false) } },
    })),
  setDoorOpen: (id, open) =>
    set((s) => ({ doors: { ...s.doors, [id]: { open } } })),
  setNearbyDoor: (id) =>
    set((s) => (s.nearbyDoorId === id ? s : { nearbyDoorId: id })),
  __resetForTest: () => set({ ...INITIAL, doors: {} }),
}));
