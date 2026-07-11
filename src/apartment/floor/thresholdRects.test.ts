import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../types'
import { THRESHOLD_OVERLAP, thresholdRects } from './thresholdRects'

const thick = () => 0.1

function wall(partial: Partial<WallSpec> & Pick<WallSpec, 'id' | 'start' | 'end'>): WallSpec {
  return { thickness: 'internal', cutouts: [], ...partial }
}

describe('thresholdRects', () => {
  it('emits one patch per floor-level door cutout, centred in the opening', () => {
    const w = wall({
      id: 'w1',
      start: [2, 5],
      end: [8, 5], // +X wall
      cutouts: [{ kind: 'door', offset: 1.5, width: 0.9, sill: 0, head: 2.1 }],
    })
    const rects = thresholdRects([w], thick)
    expect(rects).toHaveLength(1)
    const r = rects[0]
    expect(r.cx).toBeCloseTo(2 + 1.5 + 0.45)
    expect(r.cz).toBeCloseTo(5)
    expect(r.length).toBeCloseTo(0.9)
    expect(r.depth).toBeCloseTo(0.1 + 2 * THRESHOLD_OVERLAP)
    expect(r.wallId).toBe('w1')
    // Same yaw convention as Skirting: atan2(ux, uz).
    expect(r.angle).toBeCloseTo(Math.atan2(1, 0))
  })

  it('handles walls running along Z', () => {
    const w = wall({
      id: 'w2',
      start: [4, 1],
      end: [4, 7], // +Z wall
      cutouts: [{ kind: 'door', offset: 2, width: 0.8, sill: 0, head: 2.1 }],
    })
    const [r] = thresholdRects([w], thick)
    expect(r.cx).toBeCloseTo(4)
    expect(r.cz).toBeCloseTo(1 + 2 + 0.4)
    expect(r.angle).toBeCloseTo(0)
  })

  it('skips windows and raised-sill openings (they keep a solid sill segment)', () => {
    const w = wall({
      id: 'w3',
      start: [0, 0],
      end: [6, 0],
      cutouts: [
        { kind: 'window', offset: 1, width: 1.4, sill: 0.95, head: 2.1 },
        { kind: 'door', offset: 3, width: 0.9, sill: 0.5, head: 2.1 },
      ],
    })
    expect(thresholdRects([w], thick)).toHaveLength(0)
  })

  it('skips zero-length walls and uses the per-wall thickness', () => {
    const degenerate = wall({
      id: 'w4',
      start: [1, 1],
      end: [1, 1],
      cutouts: [{ kind: 'door', offset: 0, width: 0.9, sill: 0, head: 2.1 }],
    })
    const ext = wall({
      id: 'w5',
      start: [0, 0],
      end: [4, 0],
      thickness: 'external',
      cutouts: [{ kind: 'door', offset: 1, width: 1, sill: 0, head: 2.1 }],
    })
    const rects = thresholdRects([degenerate, ext], (w) => (w.thickness === 'external' ? 0.2 : 0.1))
    expect(rects).toHaveLength(1)
    expect(rects[0].depth).toBeCloseTo(0.2 + 2 * THRESHOLD_OVERLAP)
  })
})
