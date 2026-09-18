/**
 * WALK-GESTURE-DEGRADE — pure edge-detector backing `FirstPersonCamera`'s and
 * `WalkJoystick`'s wiring into the shared camera-gesture signal
 * (`cameraMotionSignal.ts:beginCameraGesture`/`endCameraGesture`), which
 * `InteractiveDprController` reads to engage GPU-STARVE-1's interactive
 * render-resolution degrade.
 *
 * That signal is already a ref-count (`cameraMotionSignal.ts`'s module
 * `active` counter), so overlapping sources — a look-drag held while the
 * joystick is also engaged — already end exactly once, on the LAST source's
 * release: this module does not re-implement that count, it only decides
 * WHEN each source should call `begin`/`end` once.
 *
 * A pointer/touch drag and a joystick `pointerdown`/`pointerup` each already
 * have a natural discrete event pair to hang a single begin/end call off.
 * A HELD MOVEMENT KEY does not — `keydown`/`keyup` fire once per press/
 * release, but the camera moves every frame the key stays down, and nothing
 * guarantees a repeat event in between. `FirstPersonCamera`'s `useFrame`
 * therefore SAMPLES "is a movement key held" once per frame; `gestureEdge`
 * turns that continuous sample into the same one-shot begin/end pulse a
 * discrete event would have produced, by comparing this frame's sample
 * against the last one.
 */

export type GestureEdge = 'begin' | 'end' | 'none'

/**
 * `activeNow` vs `activeBefore` (the previous frame's `activeNow`) → which
 * one-shot pulse, if any, the caller should send this frame. Pure: the
 * caller owns both booleans and the actual `beginCameraGesture`/
 * `endCameraGesture` calls.
 */
export function gestureEdge(activeNow: boolean, activeBefore: boolean): GestureEdge {
  if (activeNow && !activeBefore) return 'begin'
  if (!activeNow && activeBefore) return 'end'
  return 'none'
}
