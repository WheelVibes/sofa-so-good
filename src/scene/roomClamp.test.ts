import { describe, expect, it } from 'vitest'
import { clampCentreToRects, isCentreInsideRects } from './roomClamp'

const ROOM = [{ x0: 0, z0: 0, x1: 10, z1: 6 }]

describe('clampCentreToRects', () => {
  it('leaves a centre already inside the inset rect untouched', () => {
    expect(clampCentreToRects(5, 3, 1, 0.5, ROOM)).toEqual([5, 3])
  })
  it('pulls an out-of-bounds centre back to the inset edge', () => {
    // hx=1 → x clamps to [1, 9]; hz=0.5 → z clamps to [0.5, 5.5]
    expect(clampCentreToRects(20, -5, 1, 0.5, ROOM)).toEqual([9, 0.5])
  })
})

describe('isCentreInsideRects (bug #5 room-bounds validity)', () => {
  it('true with no rects (no room constraint)', () => {
    expect(isCentreInsideRects(999, 999, 1, 1, [])).toBe(true)
  })
  it('true when the whole footprint sits inside the room', () => {
    expect(isCentreInsideRects(5, 3, 1, 0.5, ROOM)).toBe(true)
  })
  it('false when the footprint would poke outside the room', () => {
    // centre near the right wall — half-extent 1 pushes the edge past x1=10.
    expect(isCentreInsideRects(9.5, 3, 1, 0.5, ROOM)).toBe(false)
    expect(isCentreInsideRects(-1, 3, 1, 0.5, ROOM)).toBe(false)
  })
  it('true right at the inset boundary', () => {
    expect(isCentreInsideRects(9, 5.5, 1, 0.5, ROOM)).toBe(true)
  })
})
