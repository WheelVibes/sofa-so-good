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
import { createResetSlice, type ResetSlice } from './slices/resetSlice';
import { createUiSlice, UI_INITIAL, type UiSlice } from './slices/uiSlice';
import {
  createFinishesSlice,
  FINISHES_INITIAL,
  type FinishesSlice,
} from './slices/finishesSlice';
import {
  createPlacementSlice,
  PLACEMENT_INITIAL,
  type PlacementSlice,
} from './slices/placementSlice';
import {
  createClipboardSlice,
  CLIPBOARD_INITIAL,
  type ClipboardSlice,
} from './slices/clipboardSlice';
import {
  createHistorySlice,
  HISTORY_INITIAL,
  type HistorySlice,
} from './slices/historySlice';
import {
  createRemoteCatalogSlice,
  REMOTE_CATALOG_INITIAL,
  type RemoteCatalogSlice,
} from './slices/remoteCatalogSlice';
import {
  createOrientationSlice,
  ORIENTATION_INITIAL,
  type OrientationSlice,
} from './slices/orientationSlice';
import {
  createNotificationsSlice,
  NOTIFICATIONS_INITIAL,
  type NotificationsSlice,
} from './slices/notificationsSlice';

export type { CameraMode } from './slices/cameraSlice';
export type { TimeOfDay } from './slices/timeSlice';

export interface RootState
  extends CameraSlice,
    TimeSlice,
    MeasurementsSlice,
    DoorsSlice,
    ItemsSlice,
    SelectionSlice,
    UserAssetsSlice,
    ResetSlice,
    UiSlice,
    FinishesSlice,
    PlacementSlice,
    ClipboardSlice,
    HistorySlice,
    RemoteCatalogSlice,
    OrientationSlice,
    NotificationsSlice {
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
  ...UI_INITIAL,
  ...FINISHES_INITIAL,
  ...PLACEMENT_INITIAL,
  ...CLIPBOARD_INITIAL,
  ...HISTORY_INITIAL,
  ...REMOTE_CATALOG_INITIAL,
  ...ORIENTATION_INITIAL,
  ...NOTIFICATIONS_INITIAL,
};

export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createMeasurementsSlice(set, get, api),
  ...createDoorsSlice(set, get, api),
  ...createItemsSlice(set, get, api),
  ...createSelectionSlice(set, get, api),
  ...createUserAssetsSlice(set, get, api),
  ...createResetSlice(set, get, api),
  ...createUiSlice(set, get, api),
  ...createFinishesSlice(set, get, api),
  ...createPlacementSlice(set, get, api),
  ...createClipboardSlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createRemoteCatalogSlice(set, get, api),
  ...createOrientationSlice(set, get, api),
  ...createNotificationsSlice(set, get, api),
  __resetForTest: () => set({ ...INITIAL }),
}));
