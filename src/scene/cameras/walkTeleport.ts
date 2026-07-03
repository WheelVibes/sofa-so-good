/**
 * Module-level request channel for the walk-mode minimap tap-to-teleport
 * (MINIMAP-JUMP) to move the walker without threading refs across the
 * `<Minimap>` DOM overlay (outside the R3F tree) and `FirstPersonCamera`
 * (inside it). Mirrors the plain-object signal pattern in `cameraForward.ts`
 * (`cameraForwardXZ`/`cameraPosXZ`) rather than a Zustand round-trip — a tap
 * is a once-per-click event, not per-frame state, so `FirstPersonCamera`
 * polls `consumeWalkTeleport()` once per frame and applies + clears it.
 *
 * The request carries a `yaw` (radians, matching the `yaw` ref
 * `FirstPersonCamera` re-asserts the camera orientation from every frame —
 * see the curtain-interact gotcha in the visual-verification playbook) so the
 * walker faces the room it just jumped into, not wherever it happened to be
 * looking before the jump.
 */

export interface WalkTeleportRequest {
  /** Target world X (m), already clamped clear of walls by the caller. */
  x: number
  /** Target world Z (m), already clamped clear of walls by the caller. */
  z: number
  /** Yaw (radians) to face after landing — see `computeFacingYaw`. */
  yaw: number
}

let pending: WalkTeleportRequest | null = null

/** Called by the minimap tap handler to move the walker to a world XZ point. */
export function requestWalkTeleport(x: number, z: number, yaw: number): void {
  pending = { x, z, yaw }
}

/** Polled by `FirstPersonCamera`'s frame loop; clears the request once read
 *  so it applies exactly once. */
export function consumeWalkTeleport(): WalkTeleportRequest | null {
  const r = pending
  pending = null
  return r
}

/** Drops any pending request without applying it — called when the walker
 *  unmounts (leaving walk mode) so a stale tap never fires into a later
 *  session. Also used to reset state between tests. */
export function _resetWalkTeleport(): void {
  pending = null
}
