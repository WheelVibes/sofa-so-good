/**
 * Pure geometry math for the structural-soundness harness
 * (`structuralSoundness.test.tsx`). Render-agnostic and unit-tested
 * (`structuralSoundness.unit.test.ts`) so the graph maths can be verified
 * without a renderer.
 *
 * The harness renders every parametric primitive headless, collects each
 * rendered mesh's world-space axis-aligned bounding box (AABB), and asks two
 * questions of the resulting box set:
 *
 *   1. **Connectivity** — with every box inflated by a small epsilon, does the
 *      "boxes touch/overlap" adjacency graph form ONE connected component? A
 *      second component means a dangling / floating part (rubric point 2).
 *   2. **Support** — for a floor-anchored piece, does the union of all boxes
 *      reach the floor (min-Y ≤ a small tolerance)?
 *
 * Both are answered here from a plain list of AABBs; the test file owns the
 * three.js traversal that produces them.
 */

/** Axis-aligned bounding box in world space, metres. */
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}

/** True when two AABBs overlap or touch on all three axes once each is
 *  inflated outward by `eps` (metres). Inflating both by `eps` means two
 *  faces within `2·eps` of each other count as connected — a small visual
 *  reveal/gap between abutting parts still reads as attached. */
export function boxesConnected(a: AABB, b: AABB, eps: number): boolean {
  for (let axis = 0; axis < 3; axis++) {
    const aMin = a.min[axis] - eps
    const aMax = a.max[axis] + eps
    const bMin = b.min[axis] - eps
    const bMax = b.max[axis] + eps
    // Separated on this axis → not connected.
    if (aMax < bMin || bMax < aMin) return false
  }
  return true
}

/** Union-find (disjoint-set) with path compression + union by size. */
class UnionFind {
  private parent: number[]
  private size: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.size = new Array(n).fill(1)
  }
  find(x: number): number {
    let root = x
    while (this.parent[root] !== root) root = this.parent[root]
    // Path compression.
    let cur = x
    while (this.parent[cur] !== root) {
      const next = this.parent[cur]
      this.parent[cur] = root
      cur = next
    }
    return root
  }
  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (this.size[ra] < this.size[rb]) {
      this.parent[ra] = rb
      this.size[rb] += this.size[ra]
    } else {
      this.parent[rb] = ra
      this.size[ra] += this.size[rb]
    }
  }
}

/**
 * Partitions `boxes` into connected components under ε-inflated adjacency.
 * Returns an array of components, each a list of the ORIGINAL indices into
 * `boxes`, sorted largest-component-first then by first index. An empty input
 * yields `[]`.
 *
 * O(n²) pairwise — fine for the per-primitive box counts here (tens, rarely a
 * few hundred with instanced decoration), and far simpler than a spatial hash.
 */
export function connectedComponents(boxes: AABB[], eps: number): number[][] {
  const n = boxes.length
  if (n === 0) return []
  const uf = new UnionFind(n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (boxesConnected(boxes[i], boxes[j], eps)) uf.union(i, j)
    }
  }
  const byRoot = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = uf.find(i)
    const arr = byRoot.get(r)
    if (arr) arr.push(i)
    else byRoot.set(r, [i])
  }
  const comps = [...byRoot.values()]
  comps.sort((a, b) => b.length - a.length || a[0] - b[0])
  return comps
}

/** Component-wise centroid (box-centre average) of a set of indices — used to
 *  describe WHERE a disconnected fragment sits when the harness reports it. */
export function componentCentroid(boxes: AABB[], indices: number[]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0]
  for (const i of indices) {
    const b = boxes[i]
    c[0] += (b.min[0] + b.max[0]) / 2
    c[1] += (b.min[1] + b.max[1]) / 2
    c[2] += (b.min[2] + b.max[2]) / 2
  }
  const n = indices.length || 1
  return [c[0] / n, c[1] / n, c[2] / n]
}

/** Axis-aligned union of all boxes (null for an empty set). */
export function unionBox(boxes: AABB[]): AABB | null {
  if (boxes.length === 0) return null
  const min: [number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ]
  const max: [number, number, number] = [
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]
  for (const b of boxes) {
    for (let a = 0; a < 3; a++) {
      if (b.min[a] < min[a]) min[a] = b.min[a]
      if (b.max[a] > max[a]) max[a] = b.max[a]
    }
  }
  return { min, max }
}

/** Smallest gap between two components: the minimum, over all cross pairs, of
 *  the centre-to-centre separation MINUS the boxes' half-extents on the axis of
 *  greatest separation. Approximates "how far apart are the two fragments" so a
 *  report can say a part floats e.g. 42 mm from the rest. Metres. */
export function componentGap(boxes: AABB[], compA: number[], compB: number[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const i of compA) {
    for (const j of compB) {
      const a = boxes[i]
      const b = boxes[j]
      let axisGap = 0
      for (let axis = 0; axis < 3; axis++) {
        const gap = Math.max(a.min[axis] - b.max[axis], b.min[axis] - a.max[axis], 0)
        if (gap > axisGap) axisGap = gap
      }
      if (axisGap < best) best = axisGap
    }
  }
  return best === Number.POSITIVE_INFINITY ? 0 : best
}

export interface StructureReport {
  /** Number of connected components (1 = every part attached). */
  componentCount: number
  /** Components as original-index lists, largest first. */
  components: number[][]
  /** Union AABB of all boxes (null if no geometry). */
  union: AABB | null
  /** Union min-Y (floor contact if ≤ floorTolerance). */
  minY: number
  /** Union max-Y. */
  maxY: number
  /** Gap (metres) between the two largest components (0 if only one). */
  largestGap: number
}

/** Analyse a set of world-space AABBs for connectivity + vertical extent. */
export function analyzeStructure(boxes: AABB[], eps: number): StructureReport {
  const components = connectedComponents(boxes, eps)
  const union = unionBox(boxes)
  const largestGap = components.length >= 2 ? componentGap(boxes, components[0], components[1]) : 0
  return {
    componentCount: components.length,
    components,
    union,
    minY: union ? union.min[1] : Number.NaN,
    maxY: union ? union.max[1] : Number.NaN,
    largestGap,
  }
}
