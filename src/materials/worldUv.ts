import {
  BufferAttribute,
  BufferGeometry,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  ShapeUtils,
  Vector2,
} from 'three'

/** Per-surface texture transform (SweetHome3DJS texture angle/scale parity):
 *  scale tile size by `scale` (×, >1 = bigger tiles) and rotate the texture by
 *  `angle` (radians), about the surface's UV centre. Identity when absent. */
export interface UvTransform {
  scale?: number
  angle?: number
}

/** Apply a {@link UvTransform} in place to a geometry's UV attribute (world-metre
 *  UVs): `uv' = c + Rot(angle)·((uv − c) / scale)`, where `c` is the UV-bounds
 *  centre. A no-op for the identity transform. Pure-ish (mutates the passed geo). */
export function applyUvTransform(geo: BufferGeometry, t?: UvTransform): void {
  const scale = t?.scale && t.scale > 0 ? t.scale : 1
  const angle = t?.angle ?? 0
  if (scale === 1 && angle === 0) return
  const uv = geo.attributes.uv
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (let i = 0; i < uv.count; i++) {
    minU = Math.min(minU, uv.getX(i))
    maxU = Math.max(maxU, uv.getX(i))
    minV = Math.min(minV, uv.getY(i))
    maxV = Math.max(maxV, uv.getY(i))
  }
  const cu = (minU + maxU) / 2
  const cv = (minV + maxV) / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let i = 0; i < uv.count; i++) {
    const du = (uv.getX(i) - cu) / scale
    const dv = (uv.getY(i) - cv) / scale
    uv.setXY(i, cu + du * cos - dv * sin, cv + du * sin + dv * cos)
  }
  uv.needsUpdate = true
}

/** {@link applyUvTransform} as an expression: transform `geo` in place and hand
 *  it back, so a geometry `useMemo` can build-and-transform in one step. Prefer
 *  this over a separate effect — the transform MUTATES UVs, so re-running it on
 *  an already-transformed geometry compounds the scale/rotation. */
export function applyUvTransformed<T extends BufferGeometry>(geo: T, t?: UvTransform): T {
  applyUvTransform(geo, t)
  return geo
}

// ── Repetition break-up (RD-406 / MAT-006a) ────────────────────────────────
//
// Big tiled floors repeat the identical tile every `tileSize` metres — the
// "obvious tiling" tell. We attack it in the **pure UV domain** (no shader, no
// 2nd UV set, no extra texture): split the surface on the tile grid and give
// each integer tile cell a deterministic, pseudo-random **90°/180°/270°
// rotation + sub-tile offset** so adjacent cells no longer align.
//
// Seam discipline: the cell grid is snapped to the texture period (`tileSize`,
// the material's `uvScale`), so every cell boundary lands on a texture-tile
// boundary (e.g. a grout line). Because the procedural tiles are authored to
// wrap seamlessly and the per-cell rotations are multiples of 90° (which keep a
// square tile's footprint identical), the discontinuity at a boundary is the
// tile-to-tile phase/orientation change we *want* — it reads as natural tile
// variation hiding in the grout, not a crack. The sub-tile offset re-phases the
// (wrapping) texture WITHIN the cell, so the rotated tile stays inside its own
// cell — it never bleeds a neighbour's interior across the boundary.

/** A deterministic per-cell hash → 32-bit unsigned int. Pure + stable: the same
 *  `(cu, cv)` always yields the same value (re-runs are byte-identical). Cheap
 *  integer mixing (xorshift/multiply) — no float drift, no NaN. */
function hashCell(cu: number, cv: number): number {
  // Fold signed cell indices in so negatives hash cleanly (imul keeps it i32).
  let h = (Math.imul(cu | 0, 0x1f1f1f1f) + Math.imul(cv | 0, 0x8da6b343)) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h = (h ^ (h >>> 12)) >>> 0
  h = Math.imul(h, 0x297a2d39) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h >>> 0
}

/** The deterministic per-cell UV transform: a quarter-turn count (0..3) and a
 *  sub-tile offset (each in `[0,1)` of a tile), derived purely from the cell
 *  index. Exported for unit-testing the period-breaking + determinism. */
export interface CellUvTransform {
  /** Quarter turns (×90°) applied about the cell centre. */
  quarters: 0 | 1 | 2 | 3
  /** Sub-tile U offset in tile fractions, `[0,1)`. */
  offU: number
  /** Sub-tile V offset in tile fractions, `[0,1)`. */
  offV: number
}

/**
 * Pure, deterministic per-cell transform from a cell index. Same input →
 * identical output; never NaN/inf.
 *
 * `quarterTurns` is the DIRECTION guard (see `materials/finishDirection.ts`).
 * With it false the cell may only turn 180°, which leaves a plank, a course or
 * a stripe running exactly as it was while still re-phasing the cell — rotating
 * a wood floor 90° every other cell lays the planks across each other, which is
 * a patchwork no floor is ever laid in. Isotropic finishes (marble, terrazzo,
 * square tile…) pass true and get the full set.
 */
export function cellUvTransform(cu: number, cv: number, quarterTurns = true): CellUvTransform {
  const h = hashCell(cu, cv)
  // Half-turn mode reuses bit 1 (not bit 0) so a cell's rotation still varies
  // independently of its sub-tile offsets below.
  const quarters = (quarterTurns ? h & 3 : (h & 2) === 0 ? 0 : 2) as 0 | 1 | 2 | 3
  // Sub-tile offset, quantised to **half-tile** steps {0, 0.5}. A half-tile shift
  // lands grout exactly on the next sub-tile line of a 2ⁿ-grid ceramic tile, so
  // the grout stays continuous (no broken/jogging grout lines) — while still
  // de-correlating a non-gridded texture (stone/marble/terrazzo/wood) cell-to-cell.
  // Two independent bits drive U/V so a half-step lands on a clean rational
  // (no float drift across runs). 90°-rotation alone already breaks the period;
  // the half-offset adds phase variety without risking a seam.
  const offU = (h >>> 8) & 1 ? 0.5 : 0
  const offV = (h >>> 9) & 1 ? 0.5 : 0
  return { quarters, offU, offV }
}

/** Map a UV (already in **tile fractions within its cell**, both in `[0,1]`)
 *  through a {@link CellUvTransform}: rotate about the tile centre by
 *  `quarters·90°`, then add the sub-tile offset. Returns tile-fraction UVs. Pure. */
function applyCellUv(fu: number, fv: number, t: CellUvTransform): [number, number] {
  // Rotate about the tile centre (0.5, 0.5) by quarter turns. cos/sin of
  // multiples of 90° are exact integers → no float drift.
  const du = fu - 0.5
  const dv = fv - 0.5
  let ru: number
  let rv: number
  switch (t.quarters) {
    case 1:
      ru = -dv
      rv = du
      break
    case 2:
      ru = -du
      rv = -dv
      break
    case 3:
      ru = dv
      rv = -du
      break
    default:
      ru = du
      rv = dv
      break
  }
  return [ru + 0.5 + t.offU, rv + 0.5 + t.offV]
}

/**
 * Subdivide a `width × height` (metres) plane on the `tileSize`-metre tile grid
 * and rewrite each cell's UVs through {@link cellUvTransform}, so adjacent tiles
 * no longer align. Returns a fresh non-indexed-but-indexed {@link BufferGeometry}
 * laid out exactly like a floor `PlaneGeometry` (XY plane, +Z normal, centred on
 * the origin), a drop-in for {@link worldUvPlaneGeometry}'s output.
 *
 * Pure (no globals, no flag read) + deterministic. Degenerate guards: a
 * non-positive size, a non-finite/non-positive `tileSize`, or a surface smaller
 * than two tiles in BOTH axes → returns `null` (caller keeps the plain plane; a
 * `repeat:1` / sub-tile surface has no neighbour to mis-align against).
 */
export function breakRepetitionPlane(
  width: number,
  height: number,
  tileSize: number,
  quarterTurns = true,
): BufferGeometry | null {
  if (!(width > 0) || !(height > 0)) return null
  if (!Number.isFinite(tileSize) || tileSize <= 0) return null
  const nu = Math.round(width / tileSize)
  const nv = Math.round(height / tileSize)
  // Fewer than two tiles in BOTH axes ⇒ no neighbour to mis-align against; leave
  // it to the plain (cheaper, byte-identical) path.
  if (nu < 2 && nv < 2) return null
  const cols = Math.max(1, nu)
  const rows = Math.max(1, nv)
  // Guard a pathological subdivision (huge floor + tiny tile) so we never build a
  // runaway vertex buffer; fall back to the plain plane.
  if (cols * rows > 4096) return null

  const cellCount = cols * rows
  const positions = new Float32Array(cellCount * 4 * 3)
  const uvs = new Float32Array(cellCount * 4 * 2)
  const normals = new Float32Array(cellCount * 4 * 3)
  const indices = new Uint32Array(cellCount * 6)
  // PlaneGeometry centres on the origin and spans [-w/2, +w/2] × [-h/2, +h/2],
  // with UVs (after worldUvPlaneGeometry) running 0..width / 0..height. Match
  // both so this is a drop-in (the mesh sits at the same place either way).
  let pi = 0
  let ui = 0
  let ni = 0
  let ii = 0
  let vert = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = -width / 2 + (c / cols) * width
      const x1 = -width / 2 + ((c + 1) / cols) * width
      // worldUvPlaneGeometry scales the default 0..1 plane UV by height, so V
      // increases with +Y. Keep that mapping (UV start anchored at the cell).
      const y0 = -height / 2 + (r / rows) * height
      const y1 = -height / 2 + ((r + 1) / rows) * height
      const baseU = (c / cols) * width
      const baseV = (r / rows) * height
      const t = cellUvTransform(c, r, quarterTurns)
      // Tile-fraction corners (0/1) → transformed → scaled back to metre UVs by
      // tileSize so the texture's physical scale is unchanged. Anchor each cell's
      // UV origin at its world-UV start (continuous metre scale); the transform
      // only re-phases/rotates WITHIN the tile.
      const [au, av] = applyCellUv(0, 0, t)
      const [bu, bv] = applyCellUv(1, 0, t)
      const [cu2, cv2] = applyCellUv(1, 1, t)
      const [du2, dv2] = applyCellUv(0, 1, t)
      // 4 corners of this cell (CCW for the +Z front face, like PlaneGeometry).
      positions[pi++] = x0
      positions[pi++] = y0
      positions[pi++] = 0
      positions[pi++] = x1
      positions[pi++] = y0
      positions[pi++] = 0
      positions[pi++] = x1
      positions[pi++] = y1
      positions[pi++] = 0
      positions[pi++] = x0
      positions[pi++] = y1
      positions[pi++] = 0
      uvs[ui++] = baseU + au * tileSize
      uvs[ui++] = baseV + av * tileSize
      uvs[ui++] = baseU + bu * tileSize
      uvs[ui++] = baseV + bv * tileSize
      uvs[ui++] = baseU + cu2 * tileSize
      uvs[ui++] = baseV + cv2 * tileSize
      uvs[ui++] = baseU + du2 * tileSize
      uvs[ui++] = baseV + dv2 * tileSize
      for (let k = 0; k < 4; k++) {
        normals[ni++] = 0
        normals[ni++] = 0
        normals[ni++] = 1
      }
      indices[ii++] = vert
      indices[ii++] = vert + 1
      indices[ii++] = vert + 2
      indices[ii++] = vert
      indices[ii++] = vert + 2
      indices[ii++] = vert + 3
      vert += 4
    }
  }

  // PlaneGeometry() (no args) still allocates default attributes; replace them
  // wholesale with our subdivided buffers so consumers (R3F, raycast) see a
  // normal indexed BufferGeometry.
  const geo: BufferGeometry = new PlaneGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setAttribute('normal', new BufferAttribute(normals, 3))
  geo.setAttribute('uv', new BufferAttribute(uvs, 2))
  geo.setIndex(new BufferAttribute(indices, 1))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

/** Signed area of a polygon in shape space (>0 = counter-clockwise). */
function signedArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  }
  return a / 2
}

/**
 * Clip a polygon to the axis-aligned rect `[x0,x1] × [y0,y1]` (Sutherland–
 * Hodgman: four half-plane passes against a convex window). Returns the clipped
 * ring, or `[]` when the polygon misses the rect entirely.
 *
 * The classic S-H caveat — a concave subject can come back with zero-area
 * slivers joining two disjoint pieces — is harmless here: the slivers lie on the
 * clip boundary, inside the original polygon, and triangulate to degenerate
 * triangles that cover no pixels. Exported for unit tests.
 */
export function clipPolygonToRect(
  poly: [number, number][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number][] {
  const inside = (p: [number, number], edge: number) =>
    edge === 0 ? p[0] >= x0 : edge === 1 ? p[0] <= x1 : edge === 2 ? p[1] >= y0 : p[1] <= y1
  const intersect = (a: [number, number], b: [number, number], edge: number): [number, number] => {
    // Parameter along a→b where it meets the edge line. The caller only asks
    // when exactly one endpoint is inside, so the denominator is never 0.
    const t =
      edge === 0
        ? (x0 - a[0]) / (b[0] - a[0])
        : edge === 1
          ? (x1 - a[0]) / (b[0] - a[0])
          : edge === 2
            ? (y0 - a[1]) / (b[1] - a[1])
            : (y1 - a[1]) / (b[1] - a[1])
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
  }
  let out = poly
  for (let edge = 0; edge < 4 && out.length; edge++) {
    const input = out
    out = []
    for (let i = 0, j = input.length - 1; i < input.length; j = i++) {
      const cur = input[i]
      const prev = input[j]
      const curIn = inside(cur, edge)
      const prevIn = inside(prev, edge)
      if (curIn) {
        if (!prevIn) out.push(intersect(prev, cur, edge))
        out.push(cur)
      } else if (prevIn) {
        out.push(intersect(prev, cur, edge))
      }
    }
  }
  return out
}

/**
 * The polygon counterpart of {@link breakRepetitionPlane}: repetition break-up
 * for a NON-rectangular room (L-shaped flats, angled bays, custom plans), which
 * previously fell back to one un-broken world-UV unwrap and kept the visible
 * grid the rect floors had already lost.
 *
 * Rather than subdividing a plane, the room polygon (`[x, z]` world metres) is
 * **clipped by the tile grid**: each cell that overlaps the room becomes its own
 * ring, triangulated independently and UV'd through the same
 * {@link cellUvTransform} the rect path uses. The cell grid is anchored to the
 * WORLD origin (not the room's bbox), so cells line up across rooms and with the
 * rect floors, and every cell boundary still lands on a texture-tile boundary.
 *
 * Returns geometry in the same shape space as {@link worldUvShapeGeometry}
 * (vertex `(x, -z)`, +Z normal, UV in metres, drawn with the floor's -90° X
 * rotation), so it is a drop-in. `null` when the guards say leave it alone:
 * degenerate polygon/tile, under two cells (no neighbour to mis-align against),
 * or a runaway cell count (huge room, tiny tile).
 */
export function breakRepetitionShape(
  points: [number, number][],
  tileSize: number,
  quarterTurns = true,
): BufferGeometry | null {
  if (points.length < 3) return null
  if (!Number.isFinite(tileSize) || tileSize <= 0) return null
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  if (!(maxX > minX) || !(maxZ > minZ)) return null
  const c0 = Math.floor(minX / tileSize)
  const c1 = Math.ceil(maxX / tileSize)
  const r0 = Math.floor(minZ / tileSize)
  const r1 = Math.ceil(maxZ / tileSize)
  const cols = c1 - c0
  const rows = r1 - r0
  if (cols * rows < 2) return null
  if (cols * rows > 4096) return null

  // Shape space: y = -z (see worldUvShapeGeometry), and CCW so the triangulated
  // faces front the +Z normal we hand the geometry.
  const ring: [number, number][] = points.map(([x, z]) => [x, -z])
  if (signedArea(ring) < 0) ring.reverse()

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      // Cell rect in shape space: x spans the column, y spans -(row) — the sign
      // flip swaps the bounds, hence min/max rather than (lo, hi) in order.
      const cellX0 = c * tileSize
      const cellZ0 = r * tileSize
      const piece = clipPolygonToRect(
        ring,
        cellX0,
        -(cellZ0 + tileSize),
        cellX0 + tileSize,
        -cellZ0,
      )
      if (piece.length < 3) continue
      const t = cellUvTransform(c, r, quarterTurns)
      const base = positions.length / 3
      for (const [px, py] of piece) {
        positions.push(px, py, 0)
        // Tile fractions within this cell → the cell transform → back to metres.
        const [fu, fv] = applyCellUv((px - cellX0) / tileSize, (-py - cellZ0) / tileSize, t)
        uvs.push(cellX0 + fu * tileSize, cellZ0 + fv * tileSize)
      }
      const faces = ShapeUtils.triangulateShape(
        piece.map(([px, py]) => new Vector2(px, py)),
        [],
      )
      for (const [a, b, cc] of faces) indices.push(base + a, base + b, base + cc)
    }
  }
  if (!indices.length) return null

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  // Flat +Z normals — every cell piece lies in the same plane.
  const normals = new Float32Array(positions.length)
  for (let i = 2; i < normals.length; i += 3) normals[i] = 1
  geo.setAttribute('normal', new BufferAttribute(normals, 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geo.setIndex(indices)
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

/**
 * A plane whose UVs are expressed in metres rather than the default 0..1,
 * so a tiling texture (repeat = tiles-per-metre) covers the surface at a
 * consistent physical scale regardless of the plane's dimensions. This lets
 * one shared material tile correctly across rooms/walls of different sizes.
 *
 * When `breakup` is set (a tile period in metres, from the material's `uvScale`)
 * AND the surface spans ≥ 2 tiles, the plane is subdivided on the tile grid and
 * each cell's UVs are re-phased/rotated (RD-406 repetition break-up — the caller
 * gates this on the `tileBreakup` flag). When `breakup` is absent or the surface
 * is too small the plain plane is returned, byte-identical to the pre-break-up
 * behaviour.
 */
export function worldUvPlaneGeometry(
  width: number,
  height: number,
  transform?: UvTransform,
  breakup?: number,
  quarterTurns = true,
): BufferGeometry {
  if (breakup != null) {
    const broken = breakRepetitionPlane(width, height, breakup, quarterTurns)
    if (broken) {
      applyUvTransform(broken, transform)
      return broken
    }
  }
  const geo = new PlaneGeometry(width, height)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height)
  }
  uv.needsUpdate = true
  applyUvTransform(geo, transform)
  return geo
}

/**
 * A triangulated floor from an arbitrary world-space polygon (`[x, z]` metres),
 * for non-rectangular rooms. The shape is built with vertices `(x, -z)` so that
 * a mesh rotated `[-π/2, 0, 0]` (the floor orientation) lands each vertex at
 * world `(x, 0, z)` with the normal facing up. UVs are set in metres (`x`, `z`)
 * so a tiling texture covers it at the same physical scale as the rect floors.
 * The mesh using this geometry needs no position offset (verts are absolute).
 *
 * `breakup` (a tile period in metres) opts into the RD-406 repetition break-up
 * for irregular rooms — see {@link breakRepetitionShape}. Without it, or when
 * the room is too small to have two cells, the plain unwrap is returned
 * byte-identical to the pre-break-up behaviour.
 */
export function worldUvShapeGeometry(
  points: [number, number][],
  transform?: UvTransform,
  breakup?: number,
  quarterTurns = true,
): BufferGeometry {
  if (breakup != null) {
    const broken = breakRepetitionShape(points, breakup, quarterTurns)
    if (broken) {
      applyUvTransform(broken, transform)
      return broken
    }
  }
  const shape = new Shape()
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()
  const geo = new ShapeGeometry(shape)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    // pos.y === -worldZ (see above) → v = worldZ.
    uv.setXY(i, pos.getX(i), -pos.getY(i))
  }
  uv.needsUpdate = true
  applyUvTransform(geo, transform)
  return geo
}
