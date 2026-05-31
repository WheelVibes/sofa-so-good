import type { RootState } from '../store'
import type { SliceCreator } from './types'

export type CameraMode = 'orbit' | 'firstPerson'

export interface CameraSlice {
  cameraMode: CameraMode
  /** Bumped to request the orbit camera snap to a top-down plan view. */
  topViewNonce: number
  /** Bumped to request the orbit camera return to the default 3/4 overview. */
  homeViewNonce: number
  /** Slow auto-orbit for presentation / recording a turntable clip. */
  autoRotate: boolean
  /** Bumped to request the orbit camera re-focus on `focusPoint`. */
  focusNonce: number
  /** World [x, z] the orbit camera should frame on the next focus request. */
  focusPoint: [number, number] | null
  /** True while an automated walkthrough tour is playing. */
  touring: boolean
  setCameraMode: (m: CameraMode) => void
  requestTopView: () => void
  requestHomeView: () => void
  toggleAutoRotate: () => void
  /** Re-target the orbit camera onto a world point (double-click an item). */
  focusOn: (point: [number, number]) => void
  setTouring: (v: boolean) => void
}

export const CAMERA_INITIAL: Pick<
  CameraSlice,
  | 'cameraMode'
  | 'topViewNonce'
  | 'homeViewNonce'
  | 'autoRotate'
  | 'focusNonce'
  | 'focusPoint'
  | 'touring'
> = {
  cameraMode: 'orbit',
  topViewNonce: 0,
  homeViewNonce: 0,
  autoRotate: false,
  focusNonce: 0,
  focusPoint: null,
  touring: false,
}

export const createCameraSlice: SliceCreator<CameraSlice, RootState> = (set, get) => ({
  ...CAMERA_INITIAL,
  setCameraMode: (m) => {
    const changed = get().cameraMode !== m
    set({ cameraMode: m })
    // Mask the orbit↔walk transition with the loading overlay. Only on a real
    // mode change, and not while the room editor is active (it owns the overlay).
    if (changed && !get().roomEditor.active) {
      get().showLoading(m === 'firstPerson' ? 'Entering walkthrough…' : 'Switching to overview…')
    }
  },
  requestTopView: () => set((s) => ({ topViewNonce: s.topViewNonce + 1, cameraMode: 'orbit' })),
  requestHomeView: () => set((s) => ({ homeViewNonce: s.homeViewNonce + 1, cameraMode: 'orbit' })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  focusOn: (point) => set((s) => ({ focusPoint: point, focusNonce: s.focusNonce + 1 })),
  setTouring: (v) => set({ touring: v }),
})
