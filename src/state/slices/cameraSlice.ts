import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type CameraMode = 'orbit' | 'firstPerson';

export interface CameraSlice {
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
}

export const CAMERA_INITIAL: Pick<CameraSlice, 'cameraMode'> = {
  cameraMode: 'orbit',
};

export const createCameraSlice: SliceCreator<CameraSlice, RootState> = (set) => ({
  ...CAMERA_INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
});
