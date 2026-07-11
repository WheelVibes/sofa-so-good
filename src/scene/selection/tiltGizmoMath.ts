import { clampTilt, TILT_LIMIT_RAD } from '../../furniture/tiltRotation'

/**
 * Pure math for the 3D **tilt** gizmo (PARITY-TILT tail) — the in-viewport
 * "joystick" handle that drags a selected item's pitch/roll, mirroring the
 * inspector's `TiltControls` sliders (`ui/inspector/TiltControls.tsx`).
 *
 * Unlike `RotateGizmo`/`ResizeGizmo`, tilt has no natural world-space plane to
 * raycast onto (pitch/roll aren't floor-plane quantities), so the drag maps
 * raw **screen-space pixel delta** since grab directly to an angle delta —
 * vertical movement to pitch, horizontal to roll — clamped to the same
 * ±`TILT_LIMIT_DEG` range as the sliders (`furniture/tiltRotation.ts`) so the
 * two affordances can never disagree on how far a piece can lean.
 *
 * Pure (no three/React/store) so it unit-tests in isolation, same as
 * `rotateGizmoMath.ts`/`resizeGizmoMath.ts`.
 */

/** Screen pixels of drag needed to sweep the full ±`TILT_LIMIT_DEG` range
 *  end-to-end. Tuned so a comfortable, well under one screen-height drag
 *  reaches the limit on both desktop and touch. */
export const TILT_DRAG_RANGE_PX = 220

/** Radians of tilt per pixel of screen-space drag, derived from the shared
 *  ±`TILT_LIMIT_DEG` range so the full range is reachable in one drag. */
export const TILT_RAD_PER_PX = (TILT_LIMIT_RAD * 2) / TILT_DRAG_RANGE_PX

/** Anchor + handle geometry (metres) for the joystick drawn above the item. */
const TILT_HANDLE_GAP = 0.12 // clearance above the item's bbox top
export const TILT_ROD_LENGTH = 0.22 // rod rise from the anchor to the ball
export const TILT_HANDLE_RADIUS = 0.075 // grab-ball radius (matches RotateGizmo's knob)

export interface TiltDragResult {
  pitch: number
  roll: number
}

/**
 * Resolve the live pitch/roll during a gizmo drag from the raw screen-space
 * pointer delta (pixels) since grab. Vertical drag (`dyPx`, screen-down
 * positive) maps to pitch — dragging down noses the item forward/down, up
 * noses it back/up, matching the inspector slider's "forward / back" framing.
 * Horizontal drag (`dxPx`) maps to roll — dragging right banks the item
 * right. Both are added to the angles captured at grab and clamped to the
 * shared ±`TILT_LIMIT_DEG` range.
 */
export function computeTiltDrag(
  startPitch: number,
  startRoll: number,
  dxPx: number,
  dyPx: number,
): TiltDragResult {
  return {
    pitch: clampTilt(startPitch + dyPx * TILT_RAD_PER_PX),
    roll: clampTilt(startRoll + dxPx * TILT_RAD_PER_PX),
  }
}

/** The joystick anchor's height above the floor (metres): the item's real
 *  height (already scaled) plus its elevation plus a fixed clearance gap, so
 *  the handle never sits inside/co-planar with the mesh at any camera angle
 *  (no z-fighting/clipping — the handle also renders `depthTest: false`, but
 *  a sane vertical offset keeps it visually anchored just above the piece). */
export function tiltGizmoAnchorHeight(itemHeight: number, elevation: number): number {
  return Math.max(0, itemHeight) + Math.max(0, elevation) + TILT_HANDLE_GAP
}
