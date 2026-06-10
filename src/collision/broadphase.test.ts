import { describe, expect, it } from 'vitest'
import { type AabbItem, buildGrid, candidatePairs, queryRect } from './broadphase'

/** Brute-force reference: all unique pairs whose (padded) AABBs overlap. */
const bruteForcePairs = (items: AabbItem[], padding = 0): Set<string> => {
  const out = new Set<string>()
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      if (
        a.minX - padding <= b.maxX &&
        a.maxX + padding >= b.minX &&
        a.minZ - padding <= b.maxZ &&
        a.maxZ + padding >= b.minZ
      ) {
        const [lo, hi] = a.id < b.id ? [a.id, b.id] : [b.id, a.id]
        out.add(`${lo}|${hi}`)
      }
    }
  }
  return out
}

/** Canonical key for a returned pair, order-independent. */
const pairKey = ([a, b]: [string, string]): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Seeded PRNG (mulberry32) for reproducible random fixtures. */
const makeRng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const randomItems = (count: number, seed: number, spread = 40): AabbItem[] => {
  const rng = makeRng(seed)
  const items: AabbItem[] = []
  for (let i = 0; i < count; i++) {
    const x = (rng() - 0.5) * spread
    const z = (rng() - 0.5) * spread
    const w = 0.2 + rng() * 2.5
    const d = 0.2 + rng() * 2.5
    items.push({ id: `item-${i}`, minX: x, minZ: z, maxX: x + w, maxZ: z + d })
  }
  return items
}

describe('candidatePairs — superset guarantee', () => {
  it('is a superset of brute-force overlapping pairs across many seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const items = randomItems(80, seed)
      const grid = buildGrid(items)
      const candidate = new Set(candidatePairs(grid).map(pairKey))
      const truth = bruteForcePairs(items)
      for (const t of truth) {
        expect(candidate.has(t)).toBe(true)
      }
    }
  })

  it('exactly matches brute force when the candidate prefilter is applied (no padding)', () => {
    // candidatePairs applies an exact AABB test, so with no padding the result
    // should equal brute force precisely.
    for (let seed = 100; seed <= 110; seed++) {
      const items = randomItems(60, seed)
      const grid = buildGrid(items)
      const candidate = new Set(candidatePairs(grid).map(pairKey))
      const truth = bruteForcePairs(items)
      expect(candidate).toEqual(truth)
    }
  })

  it('superset holds with a custom cellSize', () => {
    const items = randomItems(120, 7)
    for (const cellSize of [0.5, 1, 3, 10]) {
      const grid = buildGrid(items, cellSize)
      const candidate = new Set(candidatePairs(grid).map(pairKey))
      const truth = bruteForcePairs(items)
      for (const t of truth) expect(candidate.has(t)).toBe(true)
    }
  })
})

describe('candidatePairs — padding (near pairs)', () => {
  const a: AabbItem = { id: 'a', minX: 0, minZ: 0, maxX: 1, maxZ: 1 }
  // 2 m gap on X (faces at x=1 and x=3).
  const b: AabbItem = { id: 'b', minX: 3, minZ: 0, maxX: 4, maxZ: 1 }

  it('excludes a far pair with no padding', () => {
    const grid = buildGrid([a, b])
    expect(candidatePairs(grid)).toHaveLength(0)
  })

  it('includes a near pair within the padding distance', () => {
    const grid = buildGrid([a, b])
    const pairs = candidatePairs(grid, { padding: 2.5 })
    expect(pairs.map(pairKey)).toContain('a|b')
  })

  it('still excludes pairs beyond the padding distance', () => {
    const grid = buildGrid([a, b])
    // 2 m gap, pad 0.5 each side = 1 m closure < 2 m: still apart.
    expect(candidatePairs(grid, { padding: 0.5 })).toHaveLength(0)
  })

  it('padded candidates are a superset of padded brute force (3 m walkway scan)', () => {
    for (let seed = 200; seed <= 210; seed++) {
      const items = randomItems(70, seed)
      const grid = buildGrid(items)
      const padding = 3
      const candidate = new Set(candidatePairs(grid, { padding }).map(pairKey))
      const truth = bruteForcePairs(items, padding)
      for (const t of truth) expect(candidate.has(t)).toBe(true)
    }
  })
})

describe('candidatePairs — determinism & no duplicates / self-pairs', () => {
  it('returns identical output on repeated calls', () => {
    const items = randomItems(50, 42)
    const grid = buildGrid(items)
    expect(candidatePairs(grid)).toEqual(candidatePairs(grid))
    expect(candidatePairs(grid, { padding: 1.5 })).toEqual(candidatePairs(grid, { padding: 1.5 }))
  })

  it('emits each pair at most once and never a self-pair', () => {
    const items = randomItems(90, 9)
    const grid = buildGrid(items)
    const pairs = candidatePairs(grid, { padding: 2 })
    const seen = new Set<string>()
    for (const [x, y] of pairs) {
      expect(x).not.toBe(y)
      const k = pairKey([x, y])
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
  })
})

describe('edge cases', () => {
  it('0 items → no pairs', () => {
    expect(candidatePairs(buildGrid([]))).toEqual([])
  })

  it('1 item → no pairs', () => {
    const grid = buildGrid([{ id: 'solo', minX: 0, minZ: 0, maxX: 1, maxZ: 1 }])
    expect(candidatePairs(grid)).toEqual([])
  })

  it('all items coincident at one spot → every pair returned', () => {
    const items: AabbItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      minX: 2,
      minZ: 2,
      maxX: 3,
      maxZ: 3,
    }))
    const grid = buildGrid(items)
    const pairs = candidatePairs(grid)
    expect(pairs).toHaveLength(10) // C(5,2)
    expect(new Set(pairs.map(pairKey)).size).toBe(10)
  })

  it('zero-size AABBs (points) at the same spot overlap', () => {
    const items: AabbItem[] = [
      { id: 'p1', minX: 1, minZ: 1, maxX: 1, maxZ: 1 },
      { id: 'p2', minX: 1, minZ: 1, maxX: 1, maxZ: 1 },
      { id: 'p3', minX: 5, minZ: 5, maxX: 5, maxZ: 5 },
    ]
    const grid = buildGrid(items)
    expect(candidatePairs(grid).map(pairKey)).toEqual(['p1|p2'])
  })

  it('negative coordinates work', () => {
    const items: AabbItem[] = [
      { id: 'n1', minX: -10, minZ: -10, maxX: -8, maxZ: -8 },
      { id: 'n2', minX: -9, minZ: -9, maxX: -7, maxZ: -7 },
      { id: 'far', minX: 50, minZ: 50, maxX: 51, maxZ: 51 },
    ]
    const grid = buildGrid(items)
    expect(candidatePairs(grid).map(pairKey)).toEqual(['n1|n2'])
  })

  it('huge sparse extents do not produce false negatives', () => {
    const items: AabbItem[] = [
      { id: 'big', minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 },
      { id: 'small', minX: 0, minZ: 0, maxX: 0.1, maxZ: 0.1 },
      { id: 'edge', minX: 999, minZ: 999, maxX: 1001, maxZ: 1001 },
    ]
    const grid = buildGrid(items)
    const candidate = new Set(candidatePairs(grid).map(pairKey))
    for (const t of bruteForcePairs(items)) expect(candidate.has(t)).toBe(true)
  })
})

describe('buildGrid — auto cell size heuristic', () => {
  it('defaults near the median item extent', () => {
    const items: AabbItem[] = [
      { id: 'a', minX: 0, minZ: 0, maxX: 2, maxZ: 1 }, // extent 2
      { id: 'b', minX: 0, minZ: 0, maxX: 2, maxZ: 1 }, // extent 2
      { id: 'c', minX: 0, minZ: 0, maxX: 2, maxZ: 1 }, // extent 2
    ]
    expect(buildGrid(items).cellSize).toBeCloseTo(2, 5)
  })

  it('clamps to a sane minimum for tiny/zero extents', () => {
    const items: AabbItem[] = [{ id: 'pt', minX: 0, minZ: 0, maxX: 0, maxZ: 0 }]
    expect(buildGrid(items).cellSize).toBeGreaterThanOrEqual(0.25)
  })

  it('honours an explicit cellSize', () => {
    expect(buildGrid([], 7).cellSize).toBe(7)
  })
})

describe('queryRect', () => {
  const items: AabbItem[] = [
    { id: 'a', minX: 0, minZ: 0, maxX: 1, maxZ: 1 },
    { id: 'b', minX: 2, minZ: 2, maxX: 3, maxZ: 3 },
    { id: 'c', minX: 5, minZ: 5, maxX: 6, maxZ: 6 },
  ]

  it('returns ids whose AABB overlaps the rect', () => {
    const grid = buildGrid(items)
    const ids = queryRect(grid, { minX: 0.5, minZ: 0.5, maxX: 2.5, maxZ: 2.5 })
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('returns empty for a rect over empty space', () => {
    const grid = buildGrid(items)
    expect(queryRect(grid, { minX: 10, minZ: 10, maxX: 11, maxZ: 11 })).toEqual([])
  })

  it('is deterministic and matches a brute-force rect scan', () => {
    const many = randomItems(100, 17)
    const grid = buildGrid(many)
    const rect = { minX: -5, minZ: -5, maxX: 5, maxZ: 5 }
    const got = queryRect(grid, rect)
    const truth = many
      .filter(
        (it) =>
          it.minX <= rect.maxX &&
          it.maxX >= rect.minX &&
          it.minZ <= rect.maxZ &&
          it.maxZ >= rect.minZ,
      )
      .map((it) => it.id)
      .sort()
    expect([...got].sort()).toEqual(truth)
    expect(queryRect(grid, rect)).toEqual(got)
  })
})
