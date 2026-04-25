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

  setCameraMode: (m: CameraMode) => void;
  setTimeOfDay: (t: TimeOfDay) => void;
  toggleMeasurements: () => void;
  toggleDoor: (id: string) => void;
  setDoorOpen: (id: string, open: boolean) => void;
  __resetForTest: () => void;
}

const INITIAL: Pick<State, 'cameraMode' | 'timeOfDay' | 'showMeasurements' | 'doors'> = {
  cameraMode: 'orbit',
  timeOfDay: 'day',
  showMeasurements: false,
  doors: {},
};

export const useStore = create<State>((set) => ({
  ...INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
  setTimeOfDay: (t) => set({ timeOfDay: t }),
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  toggleDoor: (id) =>
    set((s) => ({
      doors: { ...s.doors, [id]: { open: !(s.doors[id]?.open ?? false) } },
    })),
  setDoorOpen: (id, open) =>
    set((s) => ({ doors: { ...s.doors, [id]: { open } } })),
  __resetForTest: () => set({ ...INITIAL, doors: {} }),
}));
