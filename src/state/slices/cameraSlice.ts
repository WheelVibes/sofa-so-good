import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type CameraMode = 'orbit' | 'firstPerson';

export interface CameraSlice {
  cameraMode: CameraMode;
  /** Bumped to request the orbit camera snap to a top-down plan view. */
  topViewNonce: number;
  setCameraMode: (m: CameraMode) => void;
  requestTopView: () => void;
}

export const CAMERA_INITIAL: Pick<CameraSlice, 'cameraMode' | 'topViewNonce'> = {
  cameraMode: 'orbit',
  topViewNonce: 0,
};

export const createCameraSlice: SliceCreator<CameraSlice, RootState> = (set) => ({
  ...CAMERA_INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
  requestTopView: () =>
    set((s) => ({ topViewNonce: s.topViewNonce + 1, cameraMode: 'orbit' })),
});
