import { describe, expect, it } from 'vitest'
import type { OBB, Segment } from '../../../collision/obb'
import { isMarqueeDrag, type MarqueeItem, type MarqueeWall, marqueeSelect } from './marqueeSelect'

/** Axis-aligned unit footprint centred at (cx, cz), w×d metres, no rotation. */
function box(id: string, cx: number, cz: number, w = 1, d = 1, rot = 0): MarqueeItem {
  return { id, obb: { cx, cz, hx: w / 2, hz: d / 2, rot } satisfies OBB }
}

function wall(id: string, ax: number, az: number, bx: number, bz: number): MarqueeWall {
  return { id, segment: { ax, az, bx, bz } satisfies Segment }
}

describe('marqueeSelect — furniture', () => {
  // Three 1×1 items in a row at x = 0, 3, 6 (z = 0).
  const items = [box('a', 0, 0), box('b', 3, 0), box('c', 6, 0)]

  it('a rect over 2 of 3 footprints returns exactly those 2 ids', () => {
    // Sweep x ∈ [-1, 4], z ∈ [-1, 1] → covers a (0) and b (3), not c (6).
    const hits = marqueeSelect({ x0: -1, z0: -1, x1: 4, z1: 1 }, items, [])
    expect(hits.itemIds.sort()).toEqual(['a', 'b'])
  })

  it('partial overlap (touching one edge) still selects (intersect, not contain)', () => {
    // Rect spans x ∈ [0.4, 0.6] — fully inside item a's footprint (x ∈ [-0.5, 0.5]
    // overlaps), so a is hit even though the rect does NOT contain a.
    const hits = marqueeSelect({ x0: 0.4, z0: -0.1, x1: 0.6, z1: 0.1 }, items, [])
    expect(hits.itemIds).toEqual(['a'])
  })

  it('a rect that contains a footprint entirely also selects it', () => {
    const hits = marqueeSelect({ x0: 2, z0: -2, x1: 4, z1: 2 }, items, [])
    expect(hits.itemIds).toEqual(['b'])
  })

  it('a rect that misses every footprint returns none', () => {
    const hits = marqueeSelect({ x0: 10, z0: 10, x1: 12, z1: 12 }, items, [])
    expect(hits.itemIds).toEqual([])
  })

  it('accepts an inverted rect (dragged up-left)', () => {
    // Same coverage as the first test but corners reversed.
    const hits = marqueeSelect({ x0: 4, z0: 1, x1: -1, z1: -1 }, items, [])
    expect(hits.itemIds.sort()).toEqual(['a', 'b'])
  })
})

describe('marqueeSelect — zero-area (treat as click)', () => {
  const items = [box('a', 0, 0)]

  it('a zero-area rect returns no hits even over a footprint', () => {
    const hits = marqueeSelect({ x0: 0, z0: 0, x1: 0, z1: 0 }, items, [])
    expect(hits.itemIds).toEqual([])
    expect(hits.wallIds).toEqual([])
  })

  it('a sub-threshold wobble (under 1 cm) is not a drag', () => {
    expect(isMarqueeDrag({ x0: 0, z0: 0, x1: 0.005, z1: 0.005 })).toBe(false)
    const hits = marqueeSelect({ x0: 0, z0: 0, x1: 0.005, z1: 0.005 }, items, [])
    expect(hits.itemIds).toEqual([])
  })

  it('a rect with width but zero height is not a drag', () => {
    expect(isMarqueeDrag({ x0: -1, z0: 0, x1: 1, z1: 0 })).toBe(false)
  })

  it('a clearly-sized rect IS a drag', () => {
    expect(isMarqueeDrag({ x0: 0, z0: 0, x1: 1, z1: 1 })).toBe(true)
  })
})

describe('marqueeSelect — walls', () => {
  // A horizontal wall along z = 0 from x = 0 to x = 5, and a far wall at z = 10.
  const walls = [wall('w1', 0, 0, 5, 0), wall('w2', 0, 10, 5, 10)]

  it('a rect crossing a wall segment selects it', () => {
    const hits = marqueeSelect({ x0: 2, z0: -1, x1: 3, z1: 1 }, [], walls)
    expect(hits.wallIds).toEqual(['w1'])
  })

  it('a rect that misses every wall returns none', () => {
    const hits = marqueeSelect({ x0: 2, z0: 3, x1: 3, z1: 4 }, [], walls)
    expect(hits.wallIds).toEqual([])
  })

  it('a rect enclosing a whole wall selects it', () => {
    const hits = marqueeSelect({ x0: -1, z0: -1, x1: 6, z1: 1 }, [], walls)
    expect(hits.wallIds).toEqual(['w1'])
  })

  it('mixed selection returns both items and walls', () => {
    const items = [box('a', 1, 0.2)]
    const hits = marqueeSelect({ x0: -1, z0: -1, x1: 6, z1: 1 }, items, walls)
    expect(hits.itemIds).toEqual(['a'])
    expect(hits.wallIds).toEqual(['w1'])
  })
})

describe('marqueeSelect — rotated footprint', () => {
  it('a footprint rotated 45° is hit by its true OBB, not its AABB', () => {
    // A 2×0.4 sliver rotated 45° at the origin. Its axis-aligned bounds reach
    // roughly ±0.85 on each axis, but the true OBB near a corner of that AABB
    // is empty. A small rect parked in that empty corner must NOT select it.
    const rot = Math.PI / 4
    const item = box('r', 0, 0, 2, 0.4, rot)
    // The sliver runs along the +diagonal, so its AABB's anti-diagonal corner
    // (~0.8, ~-0.8) is empty. A rect parked there must NOT select it (proving we
    // test the true OBB, not its axis-aligned bounds).
    const cornerMiss = marqueeSelect({ x0: 0.6, z0: -0.9, x1: 0.85, z1: -0.6 }, [item], [])
    expect(cornerMiss.itemIds).toEqual([])
    // A rect straddling the origin crosses the sliver → hit.
    const centreHit = marqueeSelect({ x0: -0.2, z0: -0.2, x1: 0.2, z1: 0.2 }, [item], [])
    expect(centreHit.itemIds).toEqual(['r'])
  })
})
