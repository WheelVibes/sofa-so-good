/**
 * ORBIT-TOUCH-GESTURES (N7, `docs/audit/interaction-sweep-2026-09-18.md`) — two
 * touch inputs that engaged the interactive-DPR degrade for no camera motion:
 * `orbit-phone-two-finger-rotate` (17/32 samples `gesture.active`, camera path
 * 0.02 m over a 110° twist) and `orbit-phone-double-tap` (camera path 0.00 m
 * over 148 frames, gesture still engaged).
 *
 * Root causes, both confirmed by reading `three-stdlib`'s `OrbitControls`:
 *  - **Twist has no mapping.** `touches.TWO` is `DOLLY_PAN` (pinch → dolly,
 *    two-finger drag → pan); a pure twist — the inter-finger DISTANCE held
 *    constant while the ANGLE between the fingers turns — produces almost no
 *    dolly/pan delta (the sweep's `twoFingerRotate` op literally pivots both
 *    fingers about a fixed centre at a fixed radius: the pan midpoint and the
 *    inter-finger distance are exactly constant by construction, so only float
 *    noise reaches the built-in handler). `touches.TWO = DOLLY_ROTATE` exists
 *    in three, but it REPLACES pan with rotate — and the only way to pan on
 *    orbit from a touchscreen today is exactly this two-finger drag (desktop's
 *    "right-drag, or Shift+two-finger scroll" pan has no touch equivalent: no
 *    right mouse button, no Shift key). So pan stays, and a twist is instead
 *    read ADDITIVELY on top of whatever pan/dolly the built-in handler already
 *    does with the same two touches — the fix brief's own fallback.
 *  - **Double-tap has no mapping.** `OrbitCamera.tsx`'s only double-click focus
 *    (`Furniture.tsx`'s `onDoubleClick`) is wired to the native `dblclick` DOM
 *    event — @react-three/fiber's `onDoubleClick` prop is a direct listener on
 *    `dblclick` (`events-*.js`: `onDoubleClick: ['dblclick', false]`) — and
 *    mobile Chromium does not synthesize `dblclick` from two taps on a canvas
 *    (confirmed: CDP's `Input.dispatchTouchEvent`, which is what the sweep and
 *    any re-record use, never raises it either). Fixed by detecting the tap
 *    pair ourselves (below) and driving the SAME `focusOn` the desktop
 *    double-click already uses.
 *  - **Both engaged the degrade on a motionless touch.** `OrbitControls`'s
 *    `onPointerDown` → `onTouchStart` dispatches `start` (→ `beginCameraGesture`)
 *    unconditionally, before any pixel has moved; `end` follows on `touchend`
 *    with no `change` in between for a tap that never moved. `update()` only
 *    ever dispatches `change` when the pose actually moved past its own
 *    epsilon (`lastPosition.distanceToSquared(...) > EPS`) — a strictly more
 *    precise "did the camera really move" signal than a hand-rolled pixel
 *    slop, and one three already computes for us. `GestureArmState` below
 *    defers the real `beginCameraGesture()` call from `start` to the next
 *    `change`, so a motionless tap (or a `start`/`end` pair with nothing in
 *    between) never engages the degrade at all — the brief's "begin only once
 *    real motion has happened, not on touchstart" requirement, satisfied by an
 *    exact signal instead of an approximate pixel threshold.
 *
 * Dependency-free (plain numbers, no three.js import) — same discipline as
 * `orbitEnvelope.ts` / `frameSelection.ts` / `cameraTween.ts` — so every
 * decision here unit-tests with plain numbers; the camera/DOM-mutating half
 * (rotating the live camera, wiring the DOM listeners, calling
 * `beginCameraGesture`/`endCameraGesture`/`focusOn`) stays in `OrbitCamera.tsx`.
 */

// ── two-finger twist ─────────────────────────────────────────────────────────

/** One frame's reading of the two active touch points. */
export interface TwoFingerSample {
  /** Angle (radians) of the vector from the first touch to the second, screen space. */
  angleRad: number
  /** Distance (px) between the two touches. */
  distancePx: number
}

/** `Math.atan2` of the vector from `(ax, ay)` to `(bx, by)` — screen-space angle. */
export function twoPointAngle(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax)
}

/** Euclidean distance between the two touch points, in the same px units as the input. */
export function twoPointDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay)
}

/** Shortest signed angular difference `to − from`, wrapped into `(−π, π]` — so a
 *  twist crossing the ±180° seam (an atan2 discontinuity, not a real direction
 *  reversal) still reads as a small delta rather than a ~360° jump. */
export function angleDeltaRad(from: number, to: number): number {
  const twoPi = 2 * Math.PI
  let d = (to - from) % twoPi
  if (d > Math.PI) d -= twoPi
  else if (d <= -Math.PI) d += twoPi
  return d
}

/** Degrees the fingers must turn past their gesture baseline before it reads as
 *  an intentional twist rather than hand jitter — the fix brief's own figure. */
export const TWIST_ONSET_DEG = 3
export const TWIST_ONSET_RAD = (TWIST_ONSET_DEG * Math.PI) / 180

/** How far the inter-finger distance may drift (as a fraction of the gesture's
 *  own baseline) and still count as "stable", i.e. a twist rather than a pinch.
 *  Wide enough to absorb the sub-pixel float noise a real twist's own geometry
 *  produces (two fingers pivoting about a shared centre still perturb their
 *  measured distance by a few px in practice), narrow enough that a genuine
 *  pinch — which moves the distance by tens of percent — still suppresses it. */
export const TWIST_DISTANCE_STABLE_FRACTION = 0.15

export interface TwistGestureState {
  baseAngleRad: number
  baseDistancePx: number
  armed: boolean
}

/** Start (or restart) tracking a two-finger gesture from this frame's sample. */
export function initTwistGesture(sample: TwoFingerSample): TwistGestureState {
  return { baseAngleRad: sample.angleRad, baseDistancePx: sample.distancePx, armed: false }
}

export interface TwistStep {
  /** Radians to add to the camera's azimuth this frame, or `null` for none. */
  rotationRad: number | null
  next: TwistGestureState
}

/**
 * One frame's twist decision. A rotation arms once the fingers have turned past
 * `TWIST_ONSET_RAD` from the gesture's own baseline while the pinch distance
 * stayed within `TWIST_DISTANCE_STABLE_FRACTION` of ITS baseline; the frame that
 * crosses onset consumes the WHOLE delta since the baseline (not just the part
 * past the threshold), so nothing is lost to the deadzone. Once armed, every
 * subsequent frame's incremental angle change rotates 1:1 — no per-frame
 * re-onset — until the distance drifts outside the stable band, which
 * re-baselines AND drops the arm, so a twist that follows a real pinch has to
 * cross its own fresh onset rather than firing a stale delta the instant the
 * pinch settles.
 */
export function stepTwistGesture(state: TwistGestureState, sample: TwoFingerSample): TwistStep {
  const distanceRatio = state.baseDistancePx > 0 ? sample.distancePx / state.baseDistancePx : 1
  const distanceStable = Math.abs(distanceRatio - 1) <= TWIST_DISTANCE_STABLE_FRACTION
  if (!distanceStable) {
    return { rotationRad: null, next: initTwistGesture(sample) }
  }
  const delta = angleDeltaRad(state.baseAngleRad, sample.angleRad)
  if (!state.armed && Math.abs(delta) < TWIST_ONSET_RAD) {
    return { rotationRad: null, next: state }
  }
  return {
    rotationRad: delta,
    next: { baseAngleRad: sample.angleRad, baseDistancePx: sample.distancePx, armed: true },
  }
}

// ── gesture-arm gate (defers `beginCameraGesture` past a no-op touch) ───────

export interface GestureArmState {
  /** OrbitControls `start` events not yet matched to either a real `change` or an `end`. */
  pending: number
  /** `start`s that WERE matched to a `change` — gestures `cameraMotionSignal` has
   *  been told about and still owes exactly one `endCameraGesture()` call each. */
  armed: number
}

export function initGestureArmState(): GestureArmState {
  return { pending: 0, armed: 0 }
}

/** OrbitControls `start` — record it as pending. Does NOT begin the degrade;
 *  a `start` fires on bare `touchstart`, before any pixel has moved. */
export function onGestureStart(state: GestureArmState): GestureArmState {
  return { pending: state.pending + 1, armed: state.armed }
}

/**
 * OrbitControls `change` — proof the camera actually moved (three's own
 * `update()` only dispatches this past its internal epsilon). Arms every
 * currently-pending start at once — there is no way to attribute a `change` to
 * one particular `start`, and every pending one is still live — and reports how
 * many `beginCameraGesture()` calls the caller now owes.
 */
export function onGestureChange(state: GestureArmState): {
  beginCount: number
  next: GestureArmState
} {
  if (state.pending === 0) return { beginCount: 0, next: state }
  return { beginCount: state.pending, next: { pending: 0, armed: state.armed + state.pending } }
}

/**
 * OrbitControls `end`. A pending start that never saw a `change` was a no-op
 * touch (a stationary tap, or a `start`/`end` pair with nothing between) —
 * drop it silently, no `endCameraGesture()` owed because no `beginCameraGesture()`
 * was ever called for it. Otherwise release one armed gesture.
 */
export function onGestureEnd(state: GestureArmState): {
  endCount: number
  next: GestureArmState
} {
  if (state.pending > 0) {
    return { endCount: 0, next: { pending: state.pending - 1, armed: state.armed } }
  }
  if (state.armed > 0) {
    return { endCount: 1, next: { pending: 0, armed: state.armed - 1 } }
  }
  return { endCount: 0, next: state }
}

// ── double-tap detection ─────────────────────────────────────────────────────

export interface TapRecord {
  x: number
  y: number
  /** `performance.now()`-style timestamp, ms. */
  t: number
}

/** Two taps within this long of each other count as a double-tap. iOS/Android's
 *  own double-tap-to-zoom window is ~300 ms; a little slack for a touchscreen's
 *  own debounce. */
export const DOUBLE_TAP_MAX_INTERVAL_MS = 400
/** Two taps within this many px of each other count as "the same spot". */
export const DOUBLE_TAP_MAX_DIST_PX = 32
/** A touch that travelled further than this before lifting is a drag, not a
 *  tap — the fix brief's own slop figure, also used to gate the FIRST tap of a
 *  pair (a tap that itself moved should never seed a double-tap). */
export const TAP_MOVE_SLOP_PX = 8

/** True when `next` completes a double-tap with the previously recorded tap
 *  `prev` (or `null` if there wasn't one, or it already expired/moved too far). */
export function isDoubleTap(prev: TapRecord | null, next: TapRecord): boolean {
  if (!prev) return false
  if (next.t - prev.t > DOUBLE_TAP_MAX_INTERVAL_MS) return false
  return Math.hypot(next.x - prev.x, next.y - prev.y) <= DOUBLE_TAP_MAX_DIST_PX
}
