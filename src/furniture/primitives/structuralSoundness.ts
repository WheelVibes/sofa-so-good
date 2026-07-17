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

// ---- coplanar-face (z-fighting) detection -----------------------------------

/**
 * A world-space AABB annotated for coplanar-face detection. Extends {@link AABB}
 * with two optional tags the harness fills in from the rendered mesh:
 *
 *  - `material` — a colour+material *signature* string. Two coplanar faces that
 *    share a signature render the SAME pixels at the same depth, so the GPU's
 *    tie-break is invisible (no perceptible flicker). Same-signature pairs are
 *    therefore skipped — a genuine z-fight needs two DIFFERENT surfaces fighting
 *    for the same depth. `undefined` = unknown material → always compared.
 *  - `axisAligned` — whether the source mesh's world matrix is axis-aligned
 *    (rotation is a multiple of 90°). Only then do the AABB's six faces coincide
 *    with the mesh's real faces. A rotated mesh's AABB faces are synthetic (they
 *    don't exist in the geometry), so a coplanarity between them is meaningless;
 *    such boxes are skipped. `undefined`/`true` = treat as axis-aligned.
 *  - `boxFaces` — whether the source geometry actually FILLS its AABB with flat
 *    faces (a box/slab). A round primitive (cylinder/sphere/torus/lathe) only
 *    KISSES its AABB along tangents, so its AABB side faces are synthetic in the
 *    same way a rotated box's are — two bottles side by side would falsely read
 *    as coplanar. Such boxes are skipped. `undefined`/`true` = treat as a box.
 */
export interface CoplanarBox extends AABB {
  material?: string
  axisAligned?: boolean
  boxFaces?: boolean
}

/** A detected same-normal coplanar overlap between two boxes — a z-fight risk. */
export interface CoplanarFace {
  /** Indices into the input array (a < b). */
  a: number
  b: number
  /** Normal axis of the shared plane (0=X, 1=Y, 2=Z). */
  axis: 0 | 1 | 2
  /** Shared normal direction: +1 = both MAX faces, -1 = both MIN faces. */
  dir: 1 | -1
  /** The shared plane coordinate on `axis` (metres). */
  plane: number
  /** Overlap area of the two face rectangles in the other two axes (m²). */
  area: number
}

/** True coplanarity threshold: two faces within 0.3 mm of the same plane. This
 *  is intentionally an order of magnitude TIGHTER than the 8 mm connectivity
 *  adjacency epsilon — an 8 mm "reveal" between abutting parts is a healthy
 *  offset that PREVENTS flicker; only faces at essentially the SAME depth fight. */
export const COPLANAR_PLANE_EPS = 0.0003
/** Minimum overlap area to count as a flicker risk (~4 cm²). A corner/edge kiss
 *  (near-zero shared area) never visibly z-fights. */
export const COPLANAR_MIN_AREA = 0.0004

/**
 * Flags pairs of axis-aligned boxes whose faces will z-fight: two faces that are
 * (a) on the SAME axis-aligned plane within {@link COPLANAR_PLANE_EPS}, (b)
 * facing the SAME direction (both MAX or both MIN faces on that axis — an
 * *abutting* joint, one box's MAX face meeting the other's MIN face, has
 * opposing normals and is a legitimate contact, NOT a z-fight), and (c) whose
 * face rectangles OVERLAP in 2D with area ≥ {@link COPLANAR_MIN_AREA}.
 *
 * A small box buried INSIDE a big one with a face flush to the big box's surface
 * plane IS flagged (same normal, overlapping projection) — that's exactly the
 * aircon louvre-at-body-front bug. A face lying strictly inside the other box's
 * volume (not on any of its surface planes) never matches and is fine.
 *
 * Same-`material` pairs are skipped (identical surfaces can't visibly flicker);
 * boxes tagged `axisAligned === false` OR `boxFaces === false` are skipped (their
 * AABB faces are synthetic — this is an AABB model, so a rotated or round mesh
 * can't be judged here).
 *
 * O(n²) pairwise over the axes — matches the connectivity sweep's cost profile.
 */
export function detectCoplanarFaces(
  boxes: CoplanarBox[],
  planeEps: number = COPLANAR_PLANE_EPS,
  minArea: number = COPLANAR_MIN_AREA,
): CoplanarFace[] {
  const hits: CoplanarFace[] = []
  const n = boxes.length
  for (let i = 0; i < n; i++) {
    const a = boxes[i]
    if (a.axisAligned === false || a.boxFaces === false) continue
    for (let j = i + 1; j < n; j++) {
      const b = boxes[j]
      if (b.axisAligned === false || b.boxFaces === false) continue
      // Identical colour+material coplanar surfaces render the same pixels → the
      // depth tie-break is invisible; skip (refinement over an exemption list).
      if (a.material != null && b.material != null && a.material === b.material) continue
      for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3
        const v = (axis + 2) % 3
        // Face rectangles overlap iff the box projections overlap on u AND v.
        const ou = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u])
        if (ou <= 0) continue
        const ov = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v])
        if (ov <= 0) continue
        const area = ou * ov
        if (area < minArea) continue
        const ax = axis as 0 | 1 | 2
        // Both MAX faces coplanar (both point +axis).
        if (Math.abs(a.max[axis] - b.max[axis]) <= planeEps) {
          hits.push({ a: i, b: j, axis: ax, dir: 1, plane: (a.max[axis] + b.max[axis]) / 2, area })
        }
        // Both MIN faces coplanar (both point −axis).
        if (Math.abs(a.min[axis] - b.min[axis]) <= planeEps) {
          hits.push({ a: i, b: j, axis: ax, dir: -1, plane: (a.min[axis] + b.min[axis]) / 2, area })
        }
      }
    }
  }
  return hits
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
