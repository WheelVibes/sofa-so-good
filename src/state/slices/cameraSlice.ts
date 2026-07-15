import {
  clampFocalMm,
  clampFocusDistance,
  clampFStop,
  FOCAL_DEFAULT_MM,
  FOCUS_DEFAULT_M,
  FSTOP_DEFAULT,
} from '../../scene/cameras/cameraLensSettings'
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
  /** Bumped to request the orbit camera dolly/retarget to fit `frameBounds`
   *  (FEAT-A, "F"rame — see `controls/keybindings.ts` `frameSelection`). */
  frameNonce: number
  /** World bounds (centre + bounding-sphere radius, pre-margin) the orbit
   *  camera should fit on the next frame request. Resolved by the caller
   *  (`scene/cameras/frameSelection.ts`) from the live selection. */
  frameBounds: { center: [number, number, number]; radius: number } | null
  /** Request the orbit camera frame `bounds`. A `null` bounds (nothing
   *  selected) is a deliberate no-op — the caller already resolved that. */
  requestFrameSelection: (
    bounds: { center: [number, number, number]; radius: number } | null,
  ) => void
  setTouring: (v: boolean | 'rooms' | 'views') => void
  /** First-person observer field-of-view (degrees, clamped 50–100). */
  walkFov: number
  /** First-person observer eye-height above the floor (metres, clamped 1.2–1.9). */
  walkEyeHeight: number
  setWalkFov: (deg: number) => void
  setWalkEyeHeight: (m: number) => void
  /** Render/snapshot camera lens focal length (mm, clamped 14–200). Drives the
   *  HQ path tracer's PhysicalCamera FOV (PC2-CAM-DOF-LENS). */
  lensFocalMm: number
  /** Depth-of-field aperture f-stop. 0 = off (pinhole, no blur); else 1–22. */
  dofFStop: number
  /** Manual focus distance (metres, clamped 0.2–50) when `dofAuto` is off. */
  dofFocusDistance: number
  /** Auto-focus on the surface at screen centre instead of `dofFocusDistance`. */
  dofAuto: boolean
  setLensFocalMm: (mm: number) => void
  setDofFStop: (v: number) => void
  setDofFocusDistance: (m: number) => void
  setDofAuto: (v: boolean) => void
  /** Two-point-perspective / vertical-line-lock (FEAT-D): levels the orbit
   *  camera's pitch + applies a vertical lens-shift so verticals stay
   *  parallel instead of converging. Off by default (normal perspective). */
  verticalLock: boolean
  setVerticalLock: (v: boolean) => void
  toggleVerticalLock: () => void
  /** Parallel projection / orthographic "dollhouse" view (R3-FEAT-3): renders the
   *  whole-flat orbit camera orthographically (no perspective foreshortening) so
   *  parallel building lines stay parallel — the SketchUp / Sweet Home 3D
   *  "Parallel projection" toggle. Session-only (like `verticalLock`), off by
   *  default (normal perspective); gated by the `parallelProjection` pro flag. */
  parallelProjection: boolean
  setParallelProjection: (v: boolean) => void
  toggleParallelProjection: () => void
}

/** Per-leg pace bounds for the saved-views cinematic tour (seconds per leg).
 *  Shared so the total→per-leg conversion in `ui/recordViewTour` clamps the same
 *  way `setViewTourLegSeconds` does. */
export const MIN_VIEW_TOUR_LEG_SECONDS = 0.5
export const MAX_VIEW_TOUR_LEG_SECONDS = 12

export const CAMERA_INITIAL: Pick<
  CameraSlice,
  | 'cameraMode'
  | 'topViewNonce'
  | 'homeViewNonce'
  | 'autoRotate'
  | 'viewLevelId'
  | 'focusNonce'
  | 'focusPoint'
  | 'frameNonce'
  | 'frameBounds'
  | 'touring'
  | 'viewTourLegSeconds'
  | 'walkFov'
  | 'walkEyeHeight'
  | 'lensFocalMm'
  | 'dofFStop'
  | 'dofFocusDistance'
  | 'dofAuto'
  | 'verticalLock'
  | 'parallelProjection'
> = {
  cameraMode: 'orbit',
  topViewNonce: 0,
  homeViewNonce: 0,
  autoRotate: false,
  viewTourLegSeconds: 3.5,
  viewLevelId: 'all',
  focusNonce: 0,
  focusPoint: null,
  frameNonce: 0,
  frameBounds: null,
  touring: false,
  walkFov: WALK_FOV_DEFAULT,
  walkEyeHeight: WALK_EYE_DEFAULT,
  lensFocalMm: FOCAL_DEFAULT_MM,
  dofFStop: FSTOP_DEFAULT,
  dofFocusDistance: FOCUS_DEFAULT_M,
  dofAuto: true,
  verticalLock: false,
  parallelProjection: false,
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
  requestFrameSelection: (bounds) =>
    set((s) => (bounds ? { frameBounds: bounds, frameNonce: s.frameNonce + 1 } : {})),
  setTouring: (v) => set({ touring: v === true ? 'rooms' : v }),
  setViewTourLegSeconds: (s) =>
    set({
      viewTourLegSeconds: Math.max(
        MIN_VIEW_TOUR_LEG_SECONDS,
        Math.min(MAX_VIEW_TOUR_LEG_SECONDS, s),
      ),
    }),
  setWalkFov: (deg) => set({ walkFov: clampWalkFov(deg) }),
  setWalkEyeHeight: (m) => set({ walkEyeHeight: clampWalkEyeHeight(m) }),
  setLensFocalMm: (mm) => set({ lensFocalMm: clampFocalMm(mm) }),
  setDofFStop: (v) => set({ dofFStop: clampFStop(v) }),
  setDofFocusDistance: (m) => set({ dofFocusDistance: clampFocusDistance(m) }),
  setDofAuto: (v) => set({ dofAuto: !!v }),
  setVerticalLock: (v) => set({ verticalLock: !!v }),
  toggleVerticalLock: () => set((s) => ({ verticalLock: !s.verticalLock })),
  setParallelProjection: (v) => set({ parallelProjection: !!v }),
  toggleParallelProjection: () => set((s) => ({ parallelProjection: !s.parallelProjection })),
})
