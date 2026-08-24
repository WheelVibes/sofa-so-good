import { describe, expect, it } from 'vitest'
import { MIN_DETAIL_WIDTH_PX, roomLabelDetail } from './planLabelDisplay'

const PX = 79 // ≈ the plan editor's px-per-metre at the default fit

describe('roomLabelDetail width guard', () => {
  it('keeps full detail for a room that is both large and wide enough', () => {
    expect(roomLabelDetail(26.6, PX, 4.16)).toBe('full')
  })

  it('drops to the name for a narrow room, even when its area allows full', () => {
    // An HDB service yard: enough area to clear the area threshold, far too
    // narrow for "P 7.24 m" / "0/2 sockets", which never wrap and so spilled
    // across the room's walls.
    const areaOnly = roomLabelDetail(3.1, PX)
    const withWidth = roomLabelDetail(3.1, PX, 0.9)
    expect(areaOnly).toBe('full')
    expect(withWidth).toBe('name')
  })

  it('uses the width threshold consistently', () => {
    const justUnder = MIN_DETAIL_WIDTH_PX / PX - 0.01
    const justOver = MIN_DETAIL_WIDTH_PX / PX + 0.01
    expect(roomLabelDetail(20, PX, justUnder)).toBe('name')
    expect(roomLabelDetail(20, PX, justOver)).toBe('full')
  })

  it('still hides the label entirely when the room is tiny on screen', () => {
    expect(roomLabelDetail(0.3, PX, 0.5)).toBe('none')
  })

  it('is unchanged when no width is supplied', () => {
    expect(roomLabelDetail(26.6, PX)).toBe('full')
    expect(roomLabelDetail(1, PX)).toBe('name')
    expect(roomLabelDetail(0.2, PX)).toBe('none')
  })
})
