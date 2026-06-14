import {
  clampWalkEyeHeight,
  clampWalkFov,
  WALK_EYE_DEFAULT,
  WALK_FOV_DEFAULT,
} from '../../scene/cameras/walkCameraSettings'
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
  /** Auto-tour state: false, the room fly-over, or the saved-views cinematic
   *  tour. Truthy checks keep working (RenderPump renders continuously). */
  touring: false | 'rooms' | 'views'
  /** Seconds per leg for the saved-views cinematic tour (video pace control). */
  viewTourLegSeconds: number
  setViewTourLegSeconds: (s: number) => void
  setCameraMode: (m: CameraMode) => void
  requestTopView: () => void
  requestHomeView: () => void
  toggleAutoRotate: () => void
  /** Storey visibility for multi-level plans: 'all' or one level id (the
   *  ground level's id is 'ground'). Stale ids degrade to 'all' in render. */
  viewLevelId: string
  setViewLevel: (id: string) => void
  /** Re-target the orbit camera onto a world point (double-click an item). */
  focusOn: (point: [number, number]) => void
  setTouring: (v: boolean | 'rooms' | 'views') => void
  /** First-person observer field-of-view (degrees, clamped 50–100). */
  walkFov: number
  /** First-person observer eye-height above the floor (metres, clamped 1.2–1.9). */
  walkEyeHeight: number
  setWalkFov: (deg: number) => void
  setWalkEyeHeight: (m: number) => void
}

export const CAMERA_INITIAL: Pick<
  CameraSlice,
  | 'cameraMode'
  | 'topViewNonce'
  | 'homeViewNonce'
  | 'autoRotate'
  | 'viewLevelId'
  | 'focusNonce'
  | 'focusPoint'
  | 'touring'
  | 'viewTourLegSeconds'
  | 'walkFov'
  | 'walkEyeHeight'
> = {
  cameraMode: 'orbit',
  topViewNonce: 0,
  homeViewNonce: 0,
  autoRotate: false,
  viewTourLegSeconds: 3.5,
  viewLevelId: 'all',
  focusNonce: 0,
  focusPoint: null,
  touring: false,
  walkFov: WALK_FOV_DEFAULT,
  walkEyeHeight: WALK_EYE_DEFAULT,
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
  setViewLevel: (viewLevelId) => set({ viewLevelId }),
  focusOn: (point) => set((s) => ({ focusPoint: point, focusNonce: s.focusNonce + 1 })),
  setTouring: (v) => set({ touring: v === true ? 'rooms' : v }),
  setViewTourLegSeconds: (s) => set({ viewTourLegSeconds: Math.max(0.5, Math.min(12, s)) }),
  setWalkFov: (deg) => set({ walkFov: clampWalkFov(deg) }),
  setWalkEyeHeight: (m) => set({ walkEyeHeight: clampWalkEyeHeight(m) }),
})
