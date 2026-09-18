/**
 * WALK-GESTURE-LEASE (N1) — a "the user is still driving" LEASE with
 * begin / renew / expire semantics, for input sources that have no natural
 * end event.
 *
 * Pointer Lock is the motivating case. It has no down/up pair: the browser
 * fires `pointerlockchange` on acquire and (maybe) on release, and every
 * `mousemove` in between drives the camera. v0.35.5.2 treated the LOCK as the
 * gesture — begin on acquire, end on release — and the 2026-09-18 sweep caught
 * the consequence: a lock acquired and never released (headless never fires the
 * releasing `pointerlockchange`; a real user simply keeps the lock while
 * standing still) pinned the shared gesture ref-count `active` forever, so
 * GPU-STARVE-1's interactive degrade held the canvas at DPR 0.5 for 7 clips /
 * ~2 100 frames. Pointer Lock is a STATE, not a gesture.
 *
 * So: the lease is taken by actual MOVEMENT and renewed by each further
 * movement; it expires on its own after `LEASE_IDLE_MS` of stillness. Holding
 * the lock while not moving the mouse is not a gesture and costs nothing.
 *
 * Pure and synchronous on purpose (no timers, no `performance.now()` inside) so
 * the transition logic is unit-testable; the caller owns the clock, the timer
 * and the `beginCameraGesture`/`endCameraGesture` calls it pairs with.
 */

/** Idle time (ms) after the last renewal at which an un-renewed lease expires.
 *  Long enough to bridge the gap between two rAF-rate mousemove bursts and a
 *  hand pausing mid-sweep; short enough that standing still restores full
 *  resolution within one release debounce. */
export const LEASE_IDLE_MS = 250

export interface GestureLease {
  /** Is the lease currently held (i.e. a `beginCameraGesture()` is outstanding)? */
  held: boolean
  /** Clock value at the last `renewGestureLease` (0 when not held). */
  renewedAt: number
}

export function createGestureLease(): GestureLease {
  return { held: false, renewedAt: 0 }
}

/**
 * Take or renew the lease at `now`. Returns `'begin'` on the transition into
 * held (the caller must call `beginCameraGesture()` exactly then), `'renew'`
 * on every subsequent movement.
 */
export function renewGestureLease(lease: GestureLease, now: number): 'begin' | 'renew' {
  const begun = !lease.held
  lease.held = true
  lease.renewedAt = now
  return begun ? 'begin' : 'renew'
}

/**
 * Expire the lease if it has gone `idleMs` without a renewal. Returns `'end'`
 * exactly once, on the expiring call (the caller must call
 * `endCameraGesture()` then); `null` otherwise, including when the lease is
 * not held or is still fresh.
 */
export function expireGestureLease(
  lease: GestureLease,
  now: number,
  idleMs: number = LEASE_IDLE_MS,
): 'end' | null {
  if (!lease.held) return null
  if (now - lease.renewedAt < idleMs) return null
  lease.held = false
  lease.renewedAt = 0
  return 'end'
}

/**
 * Unconditional release — the guaranteed-end paths (window `mouseup`/
 * `pointerup`/`blur`, tab hidden, `pointerlockerror`, lock dropped, component
 * unmount). Returns `'end'` only if the lease was actually held, so it is safe
 * to call from every one of those paths and from several of them at once.
 */
export function releaseGestureLease(lease: GestureLease): 'end' | null {
  if (!lease.held) return null
  lease.held = false
  lease.renewedAt = 0
  return 'end'
}
