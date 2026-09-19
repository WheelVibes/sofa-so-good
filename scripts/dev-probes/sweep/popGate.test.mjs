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

  it('a pitch-only swing (position and yaw exactly constant) is NOT read as still -- finding R4', () => {
    // `walk-pitch-limits-phone` by construction: the camera stands still and holds the
    // pitch clamp, so x/y/z and yaw never change and ONLY the pitch column moves. Before
    // the pitch column existed this scored "still" for all 305 frames and let 46
    // motion-driven tile deltas through as POPs.
    const poses = [
      [0, 0, 11, 1.6, 6.5, 0.07, -1.4],
      [17, 1, 11, 1.6, 6.5, 0.07, -1.2],
      [33, 2, 11, 1.6, 6.5, 0.07, -1.0],
      [50, 3, 11, 1.6, 6.5, 0.07, -0.8],
      [67, 4, 11, 1.6, 6.5, 0.07, -0.6],
      [83, 5, 11, 1.6, 6.5, 0.07, -0.4],
      [100, 6, 11, 1.6, 6.5, 0.07, -0.2],
    ]
    const { speed, angSpeed } = motionAtPoses(poses, 50)
    expect(speed).toBe(0)
    expect(angSpeed).toBeGreaterThan(POP_ANGLE_SPEED)
  })

  it('a dolly whose input lands every ~80ms is not read as still on its plateau frames', () => {
    // Real shape from `orbit-phone-pinch`: a CDP `pinch` op lands a touch-move only about
    // every 80ms and the camera position is byte-identical between them, so a window
    // narrower than the plateau reads ~0 during a multi-m/s dolly. Path length over a
    // 120ms window reaches the step either side.
    const poses = [
      [0, 0, 41.6, 21.6, 26.9, 1.0087, 0.6],
      [17, 1, 41.6, 21.6, 26.9, 1.0087, 0.6],
      [35, 2, 41.6, 21.6, 26.9, 1.0087, 0.6],
      [51, 3, 41.6, 21.6, 26.9, 1.0087, 0.6],
      [76, 4, 38.1, 19.5, 24.7, 1.0087, 0.6], // one ~4.7m step
      [86, 5, 38.1, 19.5, 24.7, 1.0087, 0.6],
      [101, 6, 38.1, 19.5, 24.7, 1.0087, 0.6],
      [119, 7, 38.1, 19.5, 24.7, 1.0087, 0.6],
      [137, 8, 38.1, 19.5, 24.7, 1.0087, 0.6],
      [156, 9, 35.2, 17.8, 22.9, 1.0087, 0.6], // next step
    ]
    // t=110 sits squarely on a plateau, four rAF ticks from either step.
    const { speed } = motionAtPoses(poses, 110)
    expect(speed).toBeGreaterThan(POP_CAM_SPEED)
  })

  it('path length, not net displacement: a swing-and-return inside ONE window still reads fast', () => {
    // Widening the window to 120ms would have reintroduced the legacy gate's aliasing if
    // the estimate had stayed endpoint-to-endpoint -- this reversal returns to within 2cm
    // of where it started inside the window, so a net-displacement read would score it
    // "still". Path length is monotonic in motion and does not.
    const poses = [
      [0, 0, 10, 1, 5, 0, 0.6],
      [20, 1, 10.3, 1, 5.15, 0, 0.6],
      [40, 2, 10.6, 1, 5.3, 0, 0.6],
      [60, 3, 10.6, 1, 5.3, 0, 0.6],
      [80, 4, 10.3, 1, 5.15, 0, 0.6],
      [100, 5, 10.02, 1, 5.01, 0, 0.6],
      [120, 6, 10.01, 1, 5.0, 0, 0.6],
    ]
    const { speed } = motionAtPoses(poses, 60)
    expect(speed).toBeGreaterThan(POP_CAM_SPEED)
  })

  it('a pose row recorded before the pitch column existed (length 6) still gates on yaw alone', () => {
    const poses = [
      [0, 0, 10, 1, 5, 0],
      [25, 1, 10, 1, 5, 0.3],
      [50, 2, 10, 1, 5, 0.31],
    ]
    const { speed, angSpeed } = motionAtPoses(poses, 20)
    expect(speed).toBe(0)
    expect(angSpeed).toBeGreaterThan(POP_ANGLE_SPEED)
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
