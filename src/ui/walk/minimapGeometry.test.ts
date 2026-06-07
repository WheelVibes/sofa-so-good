import { describe, expect, it } from 'vitest'
import type { PlanRoom } from '../../floorplan/types'
import { roomPathD } from './minimapGeometry'

const base = (over: Partial<PlanRoom>): PlanRoom => ({
  id: 'r',
  name: 'Room',
  origin: [0, 0],
  width: 4,
  depth: 3,
  ...over,
})

describe('roomPathD', () => {
  it('draws a single rect for a plain room', () => {
    const d = roomPathD(base({}))
    expect(d).toBe('M0.000 0.000h4.000v3.000h-4.000Z')
  })

  it('offsets the rect by the origin', () => {
    const d = roomPathD(base({ origin: [2, 1], width: 2, depth: 2 }))
    expect(d).toBe('M2.000 1.000h2.000v2.000h-2.000Z')
  })

  it('appends a second subpath for an L-shape extension', () => {
    const d = roomPathD(base({ extension: { offset: [4, 0], width: 2, depth: 1 } }))
    expect(d).toContain('M0.000 0.000h4.000v3.000h-4.000Z')
    expect(d).toContain('M4.000 0.000h2.000v1.000h-2.000Z')
  })

  it('prefers an explicit polygon and closes it', () => {
    const d = roomPathD(
      base({
        polygon: [
          [0, 0],
          [2, 0],
          [2, 2],
        ],
      }),
    )
    expect(d).toBe('M0.000 0.000L2.000 0.000L2.000 2.000Z')
  })

  it('returns empty for a degenerate (zero-size, no-polygon) room', () => {
    expect(roomPathD(base({ width: 0, depth: 0 }))).toBe('')
  })

  it('ignores a too-short polygon and falls back to the rect', () => {
    const d = roomPathD(
      base({
        polygon: [
          [0, 0],
          [1, 1],
        ],
      }),
    )
    expect(d).toBe('M0.000 0.000h4.000v3.000h-4.000Z')
  })
})
