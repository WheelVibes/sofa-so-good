import { describe, expect, it } from 'vitest'
import { motionAt, motionAtPoses, POP_ANGLE_SPEED, POP_CAM_SPEED } from './popGate.mjs'

/**
 * SWEEP-POP-GATE — the bug this fixes: `analyse.mjs`'s POP gate used to decide "camera
 * nearly still" from the 100ms `clip.samples` series (`motionAt`). That series is an
 * INDEPENDENT timer, not synchronised to the camera's own motion, so it can phase-align
 * to straddle a whole reversal: two samples 100ms apart can show almost no NET
 * displacement even though the camera swept a large angle and came most of the way back
 * within that window — precisely what a fast orbit-drag reversal does (measured up to
 * 59deg/100ms in `orbit-reversals`). `motionAtPoses` reads the same case from
 * `clip.poses` (record.mjs's per-rAF series) and is not fooled, because it can bracket
 * the flagged frame far more tightly than one full reversal cycle.
 */
describe('SWEEP-POP-GATE: motionAt (legacy, 100ms) vs motionAtPoses (per-rAF)', () => {
  it('a 100ms sampler straddling a full swing-and-return reads near-zero net speed (the aliasing bug)', () => {
    // Two 100ms-apart samples bracketing a reversal that went out 0.6m and most of the
    // way back — net displacement is small, so the legacy gate reads "still" even
    // though the camera was moving fast for the whole window.
    const samples = [
      { wall: 0, pos: [10, 1, 5] },
      { wall: 100, pos: [10.02, 1, 5.01] }, // net ~0.022m over 100ms -> 0.22 m/s
    ]
    const { speed } = motionAt(samples, 60)
    expect(speed).toBeLessThan(POP_CAM_SPEED) // scored "still" -- the false positive risk
  })

  it('the same reversal resolved at rAF resolution reads the real instantaneous speed', () => {
    // The same 100ms window, but with the per-rAF poses that were actually inside it:
    // out to (10.6, 1, 5.3) by 50ms, back to (10.05, 1, 5.02) by 100ms -- a real fast
    // swing-and-return, exactly what the 100ms bracket above averaged away.
    const poses = [
      [0, 0, 10, 1, 5, 0],
      [17, 1, 10.2, 1, 5.1, 0],
      [33, 2, 10.4, 1, 5.2, 0],
      [50, 3, 10.6, 1, 5.3, 0], // outbound peak
      [67, 4, 10.4, 1, 5.2, 0],
      [83, 5, 10.2, 1, 5.1, 0],
      [100, 6, 10.02, 1, 5.01, 0], // back near the start
    ]
    // Around the outbound peak (t=50), the windowed gate must see real motion, not "still".
    const { speed } = motionAtPoses(poses, 45)
    expect(speed).toBeGreaterThan(POP_CAM_SPEED)
  })

  it('a genuinely still camera (position and yaw unchanged) reads speed 0 at rAF resolution', () => {
    const poses = [
      [0, 0, 10, 1, 5, 0.4],
      [17, 1, 10, 1, 5, 0.4],
      [33, 2, 10, 1, 5, 0.4],
      [50, 3, 10, 1, 5, 0.4],
    ]
    const { speed, angSpeed } = motionAtPoses(poses, 30)
    expect(speed).toBe(0)
    expect(angSpeed).toBe(0)
  })

  it('a single-rAF-tick bracket would misread mid-drag input quantisation as "still" -- the window avoids it', () => {
    // Poses 16-17ms apart where ONE adjacent pair happens to show near-zero delta
    // (no new pointer-move landed on that exact tick) even though the drag as a whole
    // is fast -- the window (50ms, centred) reaches past that single flat tick.
    const poses = [
      [0, 0, 10, 1, 5, 0],
      [16, 1, 10.3, 1, 5, 0], // real move landed here
      [33, 2, 10.3, 1, 5, 0], // no new pointer-move this tick -- flat
      [50, 3, 10.6, 1, 5, 0], // real move landed here
      [66, 4, 10.9, 1, 5, 0],
    ]
    // A bare adjacent bracket at t=33 (poses[1] -> poses[2]) would read speed 0.
    // The windowed gate must not.
    const { speed } = motionAtPoses(poses, 33)
    expect(speed).toBeGreaterThan(POP_CAM_SPEED)
  })

  it('angSpeed is 0 for an orbit clip (samples never carry yaw), matching motionAt', () => {
    const samples = [
      { wall: 0, pos: [10, 1, 5], yaw: null },
      { wall: 100, pos: [10, 1, 5], yaw: null },
    ]
    expect(motionAt(samples, 50).angSpeed).toBe(0)
  })

  it('a fast walk-look yaw swing reads above POP_ANGLE_SPEED at rAF resolution', () => {
    const poses = [
      [0, 0, 10, 1, 5, 0],
      [25, 1, 10, 1, 5, 0.3], // ~0.3 rad in 25ms = 12 rad/s
      [50, 2, 10, 1, 5, 0.31],
    ]
    const { angSpeed } = motionAtPoses(poses, 20)
    expect(angSpeed).toBeGreaterThan(POP_ANGLE_SPEED)
  })
})
