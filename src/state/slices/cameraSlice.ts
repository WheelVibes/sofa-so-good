import type { SliceCreator } from './types';
import type { RootState } from '../store';

export type CameraMode = 'orbit' | 'firstPerson';

export interface CameraSlice {
  cameraMode: CameraMode;
  /** Bumped to request the orbit camera snap to a top-down plan view. */
  topViewNonce: number;
  /** Slow auto-orbit for presentation / recording a turntable clip. */
  autoRotate: boolean;
  /** Bumped to request the orbit camera re-focus on `focusPoint`. */
  focusNonce: number;
  /** World [x, z] the orbit camera should frame on the next focus request. */
  focusPoint: [number, number] | null;
  /** True while an automated walkthrough tour is playing. */
  touring: boolean;
  setCameraMode: (m: CameraMode) => void;
  requestTopView: () => void;
  toggleAutoRotate: () => void;
  /** Re-target the orbit camera onto a world point (double-click an item). */
  focusOn: (point: [number, number]) => void;
  setTouring: (v: boolean) => void;
}

export const CAMERA_INITIAL: Pick<
  CameraSlice,
  'cameraMode' | 'topViewNonce' | 'autoRotate' | 'focusNonce' | 'focusPoint' | 'touring'
> = {
  cameraMode: 'orbit',
  topViewNonce: 0,
  autoRotate: false,
  focusNonce: 0,
  focusPoint: null,
  touring: false,
};

export const createCameraSlice: SliceCreator<CameraSlice, RootState> = (set) => ({
  ...CAMERA_INITIAL,
  setCameraMode: (m) => set({ cameraMode: m }),
  requestTopView: () =>
    set((s) => ({ topViewNonce: s.topViewNonce + 1, cameraMode: 'orbit' })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  focusOn: (point) => set((s) => ({ focusPoint: point, focusNonce: s.focusNonce + 1 })),
  setTouring: (v) => set({ touring: v }),
});
