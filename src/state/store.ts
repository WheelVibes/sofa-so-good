import { create } from 'zustand';
import {
  createCameraSlice,
  CAMERA_INITIAL,
  type CameraSlice,
} from './slices/cameraSlice';
import {
  createTimeSlice,
  TIME_INITIAL,
  type TimeSlice,
} from './slices/timeSlice';
import {
  createMeasurementsSlice,
  MEASUREMENTS_INITIAL,
  type MeasurementsSlice,
} from './slices/measurementsSlice';
import {
  createDoorsSlice,
  DOORS_INITIAL,
  type DoorsSlice,
} from './slices/doorsSlice';

export type { CameraMode } from './slices/cameraSlice';
export type { TimeOfDay } from './slices/timeSlice';

export interface RootState
  extends CameraSlice,
    TimeSlice,
    MeasurementsSlice,
    DoorsSlice {
  __resetForTest: () => void;
}

const INITIAL = {
  ...CAMERA_INITIAL,
  ...TIME_INITIAL,
  ...MEASUREMENTS_INITIAL,
  ...DOORS_INITIAL,
};

export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createMeasurementsSlice(set, get, api),
  ...createDoorsSlice(set, get, api),
  __resetForTest: () => set({ ...INITIAL }),
}));
