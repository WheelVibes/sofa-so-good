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

// SWEEP-POP-GATE window (ms), centred on the flagged frame's relMs. Documented threshold:
// wide enough to smooth single-rAF quantisation noise from discretised CDP pointer-move
// dispatch (orbit drags land real pointer deltas every ~12ms of `stepMs`, so a bare
// adjacent-pose bracket can read a near-zero delta on the ONE rAF tick that happened to
// land between two dispatched moves, even mid-drag at several m/s average -- measured
// directly on a real recording: a 16ms adjacent bracket read 0.32 m/s at a point a 101ms
// legacy bracket read 5.0 m/s, a false "still" from under-windowing, not the aliasing
// this gate exists to fix); narrow enough to stay well under the width of the fastest
// reversal this gate must resolve (measured up to 59deg/100ms in `orbit-reversals` -- a
// narrower window than the reversal's own timescale still sees the high instantaneous
// rate, unlike the legacy bracket's fixed ~100ms sampler-timer window, which is
// phase-independent of the motion and can straddle an entire swing-and-return).
export const POP_POSE_WINDOW_MS = 50

/**
 * SWEEP-POP-GATE (default): camera speed (m/s) and angular speed (rad/s) over a
 * `POP_POSE_WINDOW_MS`-wide window of `clip.poses` centred on `tMs` -- record.mjs's per-rAF
 * pose series, `[relMs, glFrame, x, y, z, yaw|null]`. Widening from a bare adjacent-sample
 * bracket to a small centred window (see `POP_POSE_WINDOW_MS`'s comment for why) keeps the
 * resolution far finer than the legacy 100ms EXTERNAL sampler timer -- which is not
 * synchronised to the camera's own motion, so it can phase-align to straddle a whole
 * reversal -- while not itself reintroducing single-rAF input-dispatch noise as a new
 * source of false "still" reads. Thresholds are UNCHANGED from `motionAt`
 * (`POP_CAM_SPEED`/`POP_ANGLE_SPEED` above).
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
  const a = poses[ai]
  const b = poses[bi]
  const dt = Math.max(1, b[0] - a[0]) / 1000
  const speed = Math.hypot(b[2] - a[2], b[3] - a[3], b[4] - a[4]) / dt
  const angSpeed = a[5] != null && b[5] != null ? Math.abs(b[5] - a[5]) / dt : 0
  return { speed, angSpeed }
}
