import { describe, expect, it } from 'vitest'
import { computeRotation, pointerAngle } from '../../scene/selection/rotateGizmoMath'

/**
 * The 2D plan furniture rotate handle reuses the 3D RotateGizmo math
 * (`pointerAngle` + `computeRotation`, 15°-snap, Shift bypass). These tests pin
 * the two conventions the plan editor specifically depends on:
 *
 *  1. Plan world coords map x→x, z→z (both scale by PX into pixels), so the
 *     gizmo angle helper can be fed plan world coords unchanged.
 *  2. The knob is drawn at the item's facing (+Z), i.e. offset `(sin θ, cos θ)`
 *     from the centre — the inverse of `pointerAngle`, so grabbing the freshly
 *     drawn knob yields a grab angle equal to the item's current rotation
 *     (the gesture starts with zero delta = no jump).
 */
describe('plan rotate handle conventions', () => {
  it('knob offset (sin, cos) round-trips to the item rotation via pointerAngle', () => {
    const cx = 10.5
    const cz = 4.1
    for (const rot of [0, Math.PI / 6, Math.PI / 2, (3 * Math.PI) / 4, -Math.PI / 3]) {
      // Knob placed at the facing direction, any radius.
      const r = 1.3
      const kx = cx + Math.sin(rot) * r
      const kz = cz + Math.cos(rot) * r
      const grab = pointerAngle(cx, cz, kx, kz)
      // Grabbing the knob and not moving leaves the rotation unchanged.
      expect(computeRotation(rot, grab, grab, true)).toBeCloseTo(rot, 5)
    }
  })

  it('a quarter-turn drag of the pointer snaps the result to a 15° mark', () => {
    const cx = 0
    const cz = 0
    // Knob starts due-south (+Z, facing) of an item at rotation 0.
    const grab = pointerAngle(cx, cz, 0, 1)
    // Pointer sweeps to due-west (−X): angle = atan2(-1, 0) = −90°.
    const moved = pointerAngle(cx, cz, -1, 0)
    const next = computeRotation(0, grab, moved, true)
    expect(next).toBeCloseTo(-Math.PI / 2, 5) // −90° is a 15° multiple
    const step = Math.PI / 12
    expect(Math.abs(next % step)).toBeLessThan(1e-9)
  })

  it('Shift (snap off) keeps the raw swept angle', () => {
    const cx = 0
    const cz = 0
    const grab = pointerAngle(cx, cz, 0, 1)
    const tenDeg = (Math.PI / 180) * 10
    // Pointer at 10° from +Z.
    const moved = pointerAngle(cx, cz, Math.sin(tenDeg), Math.cos(tenDeg))
    expect(computeRotation(0, grab, moved, false)).toBeCloseTo(tenDeg, 5)
    // …and with snap on the same 10° rounds up to 15°.
    expect(computeRotation(0, grab, moved, true)).toBeCloseTo(Math.PI / 12, 5)
  })
})
