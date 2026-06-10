/**
 * Uniform spatial-hash grid for broadphase collision/proximity queries.
 *
 * Pure and dependency-free: it operates on plain axis-aligned bounding boxes
 * (AABBs) in the X/Z ground plane, so callers can replace an O(n²) double-loop
 * design-wide scan (overlaps, narrow-gap, wall-clip) with an iteration over
 * only the near candidate pairs.
 *
 * Correctness contract: {@link candidatePairs} returns a SUPERSET of all truly
 * overlapping (or, with `padding`, near) pairs — never a false negative. It may
 * return some extra far pairs; the caller is expected to run the exact test on
 * each returned pair.
 */

export interface AabbItem {
  id: string
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Integer cell coordinate key helpers operate on `${cx},${cz}` strings. */
type CellKey = string

export interface SpatialGrid {
  /** Edge length of one square cell, in the same units as the AABBs. */
  readonly cellSize: number
  /** Map of cell key -> indices (into `items`) of items overlapping that cell. */
  readonly cells: ReadonlyMap<CellKey, number[]>
  /** The items the grid was built from, in original order. */
  readonly items: readonly AabbItem[]
}

/** Minimum auto cell size — guards against degenerate tiny/zero extents. */
const MIN_CELL_SIZE = 0.25

const cellKey = (cx: number, cz: number): CellKey => `${cx},${cz}`

/** Median of a numeric array (sorted copy); 0 for empty input. */
const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Pick an automatic cell size: roughly the median item extent (the larger of an
 * item's width/depth), clamped to a sane minimum. This keeps most items
 * spanning only a handful of cells, balancing bucket count against pair count.
 */
const autoCellSize = (items: readonly AabbItem[]): number => {
  const extents: number[] = []
  for (const it of items) {
    const w = it.maxX - it.minX
    const d = it.maxZ - it.minZ
    extents.push(Math.max(w, d))
  }
  return Math.max(MIN_CELL_SIZE, median(extents))
}

/** Inclusive integer cell-coordinate range an AABB (optionally padded) covers. */
const cellRange = (item: AabbItem, cellSize: number, padding: number) => {
  const minX = item.minX - padding
  const minZ = item.minZ - padding
  const maxX = item.maxX + padding
  const maxZ = item.maxZ + padding
  return {
    cx0: Math.floor(minX / cellSize),
    cz0: Math.floor(minZ / cellSize),
    cx1: Math.floor(maxX / cellSize),
    cz1: Math.floor(maxZ / cellSize),
  }
}

/**
 * Build a spatial grid, bucketing each item into every cell its AABB overlaps.
 *
 * @param items    AABBs to index.
 * @param cellSize Optional fixed cell size; defaults to ~median item extent
 *                 (clamped to {@link MIN_CELL_SIZE}).
 */
export function buildGrid(items: AabbItem[], cellSize?: number): SpatialGrid {
  const size = cellSize !== undefined && cellSize > 0 ? cellSize : autoCellSize(items)
  const cells = new Map<CellKey, number[]>()

  for (let i = 0; i < items.length; i++) {
    const { cx0, cz0, cx1, cz1 } = cellRange(items[i], size, 0)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = cellKey(cx, cz)
        const bucket = cells.get(key)
        if (bucket) bucket.push(i)
        else cells.set(key, [i])
      }
    }
  }

  return { cellSize: size, cells, items }
}

/** Numeric AABB overlap test (touching edges count as overlapping). */
const aabbsOverlap = (a: AabbItem, b: AabbItem, padding: number): boolean =>
  a.minX - padding <= b.maxX &&
  a.maxX + padding >= b.minX &&
  a.minZ - padding <= b.maxZ &&
  a.maxZ + padding >= b.minZ

/** Build cell buckets using padding-inflated AABBs (used by candidatePairs). */
const buildPaddedCells = (
  items: readonly AabbItem[],
  cellSize: number,
  padding: number,
): Map<CellKey, number[]> => {
  const cells = new Map<CellKey, number[]>()
  for (let i = 0; i < items.length; i++) {
    const { cx0, cz0, cx1, cz1 } = cellRange(items[i], cellSize, padding)
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = cellKey(cx, cz)
        const bucket = cells.get(key)
        if (bucket) bucket.push(i)
        else cells.set(key, [i])
      }
    }
  }
  return cells
}

/**
 * All unique pairs of items that share at least one grid cell — a superset of
 * the truly overlapping/near pairs. With `padding`, AABBs are inflated by that
 * amount so pairs that are merely *near* (within `padding`) are also returned;
 * this drives the walkway-gap scan that looks at items metres apart.
 *
 * Each pair is emitted at most once, never a self-pair, in deterministic order
 * (sorted by the two items' indices in the original `items` array).
 */
export function candidatePairs(
  grid: SpatialGrid,
  opts?: { padding?: number },
): Array<[string, string]> {
  const padding = opts?.padding ?? 0
  const { items, cellSize } = grid

  // Re-bucket with padding when requested, so a padded AABB reaches neighbours
  // it would not share a raw cell with. Reuse the existing buckets otherwise.
  const cells = padding > 0 ? buildPaddedCells(items, cellSize, padding) : grid.cells

  // Collect unique ordered index pairs (lower index first) into a set so an
  // item-pair sharing several cells is reported only once.
  const seen = new Set<number>()
  const pairs: Array<[number, number]> = []
  const n = items.length

  for (const bucket of cells.values()) {
    for (let a = 0; a < bucket.length; a++) {
      for (let b = a + 1; b < bucket.length; b++) {
        const i = bucket[a]
        const j = bucket[b]
        const lo = i < j ? i : j
        const hi = i < j ? j : i
        const code = lo * n + hi
        if (seen.has(code)) continue
        seen.add(code)
        // Cheap exact-ish reject: items can share a (padded) cell yet not have
        // overlapping padded AABBs. Dropping those keeps the superset tight
        // while preserving the no-false-negative guarantee.
        if (aabbsOverlap(items[lo], items[hi], padding)) {
          pairs.push([lo, hi])
        }
      }
    }
  }

  pairs.sort((p, q) => (p[0] - q[0] !== 0 ? p[0] - q[0] : p[1] - q[1]))
  return pairs.map(([i, j]) => [items[i].id, items[j].id])
}

export interface QueryRect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/**
 * Ids of every item whose AABB overlaps the query rect. Returns deterministic
 * order (by original item index). Useful for item-vs-walls style queries where
 * the rect is a wall's swept footprint.
 */
export function queryRect(grid: SpatialGrid, rect: QueryRect): string[] {
  const { items, cellSize } = grid
  const cx0 = Math.floor(rect.minX / cellSize)
  const cz0 = Math.floor(rect.minZ / cellSize)
  const cx1 = Math.floor(rect.maxX / cellSize)
  const cz1 = Math.floor(rect.maxZ / cellSize)

  const seen = new Set<number>()
  const matches: number[] = []
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const bucket = grid.cells.get(cellKey(cx, cz))
      if (!bucket) continue
      for (const idx of bucket) {
        if (seen.has(idx)) continue
        const it = items[idx]
        if (
          it.minX <= rect.maxX &&
          it.maxX >= rect.minX &&
          it.minZ <= rect.maxZ &&
          it.maxZ >= rect.minZ
        ) {
          seen.add(idx)
          matches.push(idx)
        }
      }
    }
  }
  matches.sort((a, b) => a - b)
  return matches.map((i) => items[i].id)
}
