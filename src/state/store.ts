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
import {
  createItemsSlice,
  ITEMS_INITIAL,
  type ItemsSlice,
} from './slices/itemsSlice';
import {
  createSelectionSlice,
  SELECTION_INITIAL,
  type SelectionSlice,
} from './slices/selectionSlice';
import {
  createUserAssetsSlice,
  USER_ASSETS_INITIAL,
  type UserAssetsSlice,
} from './slices/userAssetsSlice';

export type { CameraMode } from './slices/cameraSlice';
export type { TimeOfDay } from './slices/timeSlice';

export interface RootState
  extends CameraSlice,
    TimeSlice,
    MeasurementsSlice,
    DoorsSlice,
    ItemsSlice,
    SelectionSlice,
    UserAssetsSlice {
  __resetForTest: () => void;
}

const INITIAL = {
  ...CAMERA_INITIAL,
  ...TIME_INITIAL,
  ...MEASUREMENTS_INITIAL,
  ...DOORS_INITIAL,
  ...ITEMS_INITIAL,
  ...SELECTION_INITIAL,
  ...USER_ASSETS_INITIAL,
};

export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createMeasurementsSlice(set, get, api),
  ...createDoorsSlice(set, get, api),
  ...createItemsSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createUserAssetsSlice(set, get, api),
  __resetForTest: () => set({ ...INITIAL }),
}));
