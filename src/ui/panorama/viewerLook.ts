/**
 * Pure look-state math for the drag-to-look panorama sphere viewer
 * (`PanoramaViewer`). Kept separate from the three.js wiring so the clamping /
 * sensitivity behaviour is unit-testable.
 */

export interface LookState {
  /** Radians around the vertical axis (positive = look left under a rightward drag). */
  yaw: number
  /** Radians up/down, clamped short of the poles. */
  pitch: number
  /** Vertical field of view in degrees (zoom). */
  fov: number
}

export const INITIAL_LOOK: LookState = { yaw: 0, pitch: 0, fov: 75 }

/** Pitch clamp keeps the camera just short of straight up/down (degenerate up-vector). */
export const PITCH_LIMIT = Math.PI / 2.2
export const FOV_MIN = 35
export const FOV_MAX = 100
/** Radians of look per pixel dragged. */
export const DRAG_SENSITIVITY = 0.005
/** Degrees of fov per wheel deltaY unit. */
const ZOOM_SENSITIVITY = 0.05

/**
 * Sphere mesh yaw aligning the equirect seam so the capture's forward
 * direction (-Z, equirect u = 0.5) is what the viewer faces on open.
 */
export const SPHERE_YAW = -Math.PI / 2

/** Apply a pointer drag of (dx, dy) pixels to the look state. */
export function dragLook(s: LookState, dxPx: number, dyPx: number): LookState {
  return {
    ...s,
    yaw: s.yaw + dxPx * DRAG_SENSITIVITY,
    pitch: Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, s.pitch + dyPx * DRAG_SENSITIVITY)),
  }
}

/** Apply a wheel zoom (positive deltaY = zoom out) to the look state. */
export function zoomLook(s: LookState, wheelDeltaY: number): LookState {
  return {
    ...s,
    fov: Math.min(FOV_MAX, Math.max(FOV_MIN, s.fov + wheelDeltaY * ZOOM_SENSITIVITY)),
  }
}
