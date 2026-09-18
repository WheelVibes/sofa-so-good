import { describe, expect, it } from 'vitest'
import { gestureEdge } from './walkGestureInput'

describe('gestureEdge', () => {
  it('rising edge (false → true) is a begin', () => {
    expect(gestureEdge(true, false)).toBe('begin')
  })

  it('falling edge (true → false) is an end', () => {
    expect(gestureEdge(false, true)).toBe('end')
  })

  it('held true across frames is none after the first begin', () => {
    expect(gestureEdge(true, true)).toBe('none')
  })

  it('held false across frames is none', () => {
    expect(gestureEdge(false, false)).toBe('none')
  })

  it('a full press→release→press cycle pulses begin, none, end, begin', () => {
    let prev = false
    const edges: string[] = []
    for (const now of [true, true, false, true]) {
      edges.push(gestureEdge(now, prev))
      prev = now
    }
    expect(edges).toEqual(['begin', 'none', 'end', 'begin'])
  })
})
