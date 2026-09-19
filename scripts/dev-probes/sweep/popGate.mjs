// SWEEP-POP-GATE — pure camera-speed helpers for `analyse.mjs`'s POP event gate, split
// into their own module so they're importable by a vitest test without pulling in
// `analyse.mjs`'s top-level CLI body (which reads argv and can `process.exit`).
//
// See `docs/interaction-sweep.md` for the mechanism this exists to fix: the original
// gate read camera speed off the 100ms `clip.samples` series, which is far coarser than
// the fastest camera motion this app records (a 59deg/100ms orbit reversal) and can
// alias a genuinely-fast moment to "camera nearly still", turning ordinary
// motion-driven content change into a false POP.

export const POP_CAM_SPEED = 0.35 // m/s (orbit/walk position) under which the camera counts as still
export const POP_ANGLE_SPEED = 0.25 // rad/s for walk look

/** LEGACY (--legacy-pop-gate): camera speed (m/s) and angular speed (rad/s), bracketed
 *  from the 100ms `clip.samples` series around a clip-relative time. Kept only for A/B
 *  against `motionAtPoses` below and as the fallback for a clip recorded before
 *  `clip.poses` existed. */
export function motionAt(samples, tMs) {
  let best = null
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].wall >= tMs) {
      best = i
      break
    }
  }
  if (best === null) best = samples.length - 1
  if (best < 1) return { speed: 0, angSpeed: 0 }
  const a = samples[best - 1]
  const b = samples[best]
  const dt = Math.max(1, b.wall - a.wall) / 1000
  let speed = 0
  if (a.pos && b.pos) {
    speed = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) / dt
  }
  let angSpeed = 0
  if (a.yaw != null && b.yaw != null) {
    angSpeed = (Math.abs(b.yaw - a.yaw) + Math.abs((b.pitch ?? 0) - (a.pitch ?? 0))) / dt
  }
  return { speed, angSpeed }
}

// SWEEP-POP-GATE window (ms), centred on the flagged frame's relMs.
//
// **SWEEP-REGRESSIONS-3 widened this 50 -> 120 and switched the estimate to PATH LENGTH
// (below). Measured reason:** the 09-19 regression sweep found the 50ms endpoint-bracket
// gate under-reading phone dolly/twist gestures badly (`orbit-phone-pinch` 186 frames
// gated "still" against the legacy gate's 119; `orbit-phone-zoom-through-wall` 168 vs 121)
// and the archived `clip.poses` say exactly why: a CDP `pinch`/`twoFingerRotate` op lands a
// real touch-move only about every 80ms, and the camera position is BYTE-IDENTICAL in
// between. From `/tmp/sweep/reg-2026-09-19/phone-metal/orbit-phone-pinch/clip.json`:
//
//   [ 51, .., 41.618, 21.558, 26.892]   <- plateau
//   [ 76, .., 38.087, 19.502, 24.681]   <- one 4.7m step
//   [ 86, .., 38.087, 19.502, 24.680]   <- plateau, 4 rAF ticks wide
//   [137, .., 38.088, 19.502, 24.679]
//   [156, .., 35.199, 17.820, 22.870]   <- next step
//
// A 50ms window is NARROWER than that 80ms plateau, so it frequently sits entirely inside
// one and reads ~0.03 m/s during a 37 m/s dolly. This is the SAME "input quantisation"
// failure the original 50ms choice was already sized against, just at the coarser dispatch
// cadence of a two-finger op rather than a one-finger drag's ~12ms `stepMs`.
//
// Widening ALONE would have reintroduced the aliasing this gate exists to fix (a 120ms
// endpoint bracket can straddle a whole swing-and-return and read near-zero NET
// displacement, exactly like the legacy 100ms sampler). PATH LENGTH is what makes the
// widening safe: summing |delta| over every consecutive pose pair inside the window is
// monotonic in motion, so a reversal reads its true swept distance rather than its net
// displacement, and a plateau-plus-step reads the step. Both failure directions close with
// one change, and the gate no longer depends on the window happening to be phase-matched to
// the input cadence.
export const POP_POSE_WINDOW_MS = 120

/**
 * SWEEP-POP-GATE (default): camera speed (m/s) and angular speed (rad/s) over a
 * `POP_POSE_WINDOW_MS`-wide window of `clip.poses` centred on `tMs` -- record.mjs's per-rAF
 * pose series, `[relMs, glFrame, x, y, z, yaw|null, pitch|null]`.
 *
 * Speed is the PATH LENGTH swept inside the window divided by its duration, not the
 * endpoint-to-endpoint displacement (see `POP_POSE_WINDOW_MS`'s comment for the measured
 * reason). Angular speed sums BOTH angle columns the same way:
 *  - walk: `yaw` (index 5) and `pitch` (index 6) from `window.__walkLook`;
 *  - orbit: azimuth (5) and polar (6) from `controls`.
 *
 * **The pitch column is what closes finding R4.** `walk-pitch-limits-phone` holds position
 * and yaw EXACTLY constant by construction (11.00, 6.50, yaw 0.070 for all 302 poses) and
 * swings pitch -1.5..+1.5 rad against the clamp; with pitch missing from `clip.poses` the
 * gate scored all 305 frames "still" and passed 46 motion-driven tile deltas through as
 * POPs, while the legacy gate -- which DOES read `samples[].pitch` -- correctly read
 * 1.9 rad/s and flagged none. The camera-region deltas the audit attributed to a candle prop
 * are ordinary content change under a pitching camera; `CandleCluster.tsx` has no animation
 * to be at fault (re-confirmed: no `useFrame`, no flicker, a static emissive tetrahedron).
 *
 * Thresholds are UNCHANGED from `motionAt` (`POP_CAM_SPEED`/`POP_ANGLE_SPEED` above).
 * A pose row recorded before the pitch column existed is length 6; `undefined` reads the
 * same as `null` here, so an older clip degrades to yaw-only exactly as before.
 */
export function motionAtPoses(poses, tMs) {
  let mid = null
  for (let i = 1; i < poses.length; i++) {
    if (poses[i][0] >= tMs) {
      mid = i
      break
    }
  }
  if (mid === null) mid = poses.length - 1
  if (mid < 1) return { speed: 0, angSpeed: 0 }
  const half = POP_POSE_WINDOW_MS / 2
  let ai = mid - 1
  while (ai > 0 && poses[mid][0] - poses[ai][0] < half) ai--
  let bi = mid
  while (bi < poses.length - 1 && poses[bi][0] - poses[mid - 1][0] < half) bi++
  let dist = 0
  let ang = 0
  for (let i = ai + 1; i <= bi; i++) {
    const p = poses[i - 1]
    const q = poses[i]
    dist += Math.hypot(q[2] - p[2], q[3] - p[3], q[4] - p[4])
    if (p[5] != null && q[5] != null) ang += Math.abs(q[5] - p[5])
    if (p[6] != null && q[6] != null) ang += Math.abs(q[6] - p[6])
  }
  const dt = Math.max(1, poses[bi][0] - poses[ai][0]) / 1000
  return { speed: dist / dt, angSpeed: ang / dt }
}
