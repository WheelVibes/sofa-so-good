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
  createLocationSlice,
  LOCATION_INITIAL,
  type LocationSlice,
} from './slices/locationSlice';
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
import {
  createInstalledPacksSlice,
  INSTALLED_PACKS_INITIAL,
  type InstalledPacksSlice,
} from './slices/installedPacksSlice';
import {
  createQualitySlice,
  QUALITY_INITIAL,
  type QualitySlice,
} from './slices/qualitySlice';

export type { CameraMode } from './slices/cameraSlice';
export type { QualitySettings, QualityPreset } from './slices/qualitySlice';
export { QUALITY_PRESETS } from './slices/qualitySlice';
export type { TimeMode, TimePreset } from './slices/timeSlice';
export { PRESET_HOURS } from './slices/timeSlice';
export type { Location } from './slices/locationSlice';

export interface RootState
  extends CameraSlice,
    TimeSlice,
    LocationSlice,
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
    NotificationsSlice,
    InstalledPacksSlice,
    QualitySlice {
  __resetForTest: () => void;
}

const INITIAL = {
  ...CAMERA_INITIAL,
  ...TIME_INITIAL,
  ...LOCATION_INITIAL,
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
  ...INSTALLED_PACKS_INITIAL,
  ...QUALITY_INITIAL,
};

export const useStore = create<RootState>((set, get, api) => ({
  ...createCameraSlice(set, get, api),
  ...createTimeSlice(set, get, api),
  ...createLocationSlice(set, get, api),
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
  ...createInstalledPacksSlice(set, get, api),
  ...createQualitySlice(set, get, api),
  __resetForTest: () => set({ ...INITIAL }),
}));
