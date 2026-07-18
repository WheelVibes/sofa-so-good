import { describe, expect, it } from 'vitest'
import { layoutMepLabels } from './mepLabelLayout'

describe('layoutMepLabels', () => {
  it('places a lone point at its natural offset with no leader', () => {
    const out = layoutMepLabels([{ id: 'a', cx: 100, cy: 100 }], 11)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'a', cx: 100, cy: 100, labelX: 111, labelY: 100 })
    expect(out[0]!.hasLeader).toBe(false)
  })

  it('leaves far-apart points untouched (no collision)', () => {
    const out = layoutMepLabels(
      [
        { id: 'a', cx: 0, cy: 0 },
        { id: 'b', cx: 300, cy: 300 },
      ],
      11,
    )
    const a = out.find((p) => p.id === 'a')!
    const b = out.find((p) => p.id === 'b')!
    expect(a.hasLeader).toBe(false)
    expect(b.hasLeader).toBe(false)
    expect(a.labelY).toBe(0)
    expect(b.labelY).toBe(300)
  })

  it('fans two coincident points into distinct label positions with leaders', () => {
    const out = layoutMepLabels(
      [
        { id: 'soil-pipe', cx: 100, cy: 100 },
        { id: 'water-point', cx: 102, cy: 101 },
      ],
      11,
    )
    expect(out).toHaveLength(2)
    for (const p of out) expect(p.hasLeader).toBe(true)
    const ys = out.map((p) => p.labelY)
    expect(new Set(ys).size).toBe(2)
    expect(Math.abs(ys[0]! - ys[1]!)).toBeGreaterThanOrEqual(10)
    // Circle centres (leader targets) stay at their TRUE positions.
    const soil = out.find((p) => p.id === 'soil-pipe')!
    const water = out.find((p) => p.id === 'water-point')!
    expect(soil.cx).toBe(100)
    expect(soil.cy).toBe(100)
    expect(water.cx).toBe(102)
    expect(water.cy).toBe(101)
  })

  it('fans a three-point cluster into three distinct, evenly-spaced label rows', () => {
    const out = layoutMepLabels(
      [
        { id: 'a', cx: 50, cy: 50 },
        { id: 'b', cx: 51, cy: 52 },
        { id: 'c', cx: 49, cy: 54 },
      ],
      11,
      24,
      11,
    )
    expect(out).toHaveLength(3)
    for (const p of out) expect(p.hasLeader).toBe(true)
    const ys = [...out.map((p) => p.labelY)].sort((a, b) => a - b)
    expect(ys[1]! - ys[0]!).toBeCloseTo(11, 5)
    expect(ys[2]! - ys[1]!).toBeCloseTo(11, 5)
    // All three share the same fanned label X (centred on the cluster mean).
    const xs = new Set(out.map((p) => p.labelX))
    expect(xs.size).toBe(1)
  })

  it('chains a linear cluster transitively into one group, not overlapping pairs', () => {
    // a-b within radius, b-c within radius, a-c NOT within radius directly.
    const out = layoutMepLabels(
      [
        { id: 'a', cx: 0, cy: 0 },
        { id: 'b', cx: 20, cy: 0 },
        { id: 'c', cx: 40, cy: 0 },
      ],
      11,
      24,
    )
    for (const p of out) expect(p.hasLeader).toBe(true)
    const ys = new Set(out.map((p) => p.labelY))
    expect(ys.size).toBe(3)
  })
})
