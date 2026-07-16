/**
 * GLB Asset Designer — Stage 7c one-tap TUFTING on a plumped box cushion. Pure,
 * three-free math (unit-testable without a GPU): the button-grid layout, the
 * plump vertex displacement (crown + side bow + tuft dimples), the tuft button
 * decal generator, and the `setTuftGrid` spec op.
 *
 * ## What tufting does
 * A `TuftGrid` (rows × cols, depth, pattern) placed on a plumped box cushion
 * produces two coordinated effects:
 *  1. **Geometry** — `plumpVertexDelta` subtracts a smooth gaussian DIMPLE from
 *     the plump crown at each button point (weighted by the SAME `ry²·cos·cos`
 *     falloff as the crown, so the four corners stay pinned and the dimple is
 *     confined to the top face). `depth` 0…1 scales how deep the pull goes (a
 *     button-centre vertex drops from `crown` to `crown·(1−depth)`).
 *  2. **Decals** — `tuftDecals` emits a matching grid of `button` decals (tagged
 *     `tuft: true`) sitting IN the dimples (their local Y is the dimpled
 *     top-surface height from `plumpTopSurfaceY`, so a button reads as centred in
 *     its dimple), plus — when `stitches` is on — `stitch` line decals (also
 *     tagged) along the connections between adjacent buttons.
 *
 * **Pattern (Stage 10c):** `grid` is the rectangular rows × cols lattice; `diamond`
 * is the classic Chesterfield lattice — every other row shifted half a column
 * (edge-clamped) — with dimples + buttons following the shifted math and the stitch
 * lines running along the diagonals. Box cushions only (the plump displacement +
 * flat-top button placement assume a box; a round capsule bolster isn't tufted).
 *
 * The plump crown/bow/dimple math lives here (pure) so `plump.ts` only does the
 * three geometry construction — everything numeric is testable in node.
 */

import {
  type AssetEditSpec,
  addDecal,
  type Decal,
  decals,
  type ShapePart,
  type TuftGrid,
  type TuftPattern,
} from './editSpec'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Clamp a rows/cols count to the [1, 6] integer range. */
const clampCount = (v: number) => Math.min(6, Math.max(1, Math.round(v || 1)))

/** UI slider ranges + defaults for the tufting controls (rows/cols 1–6, depth
 *  0…1). */
export const TUFT_LIMITS = {
  rows: { min: 1, max: 6, step: 1 },
  cols: { min: 1, max: 6, step: 1 },
  depth: { min: 0, max: 1, step: 0.05 },
} as const

/** Default grid seeded when tufting is first switched on. */
export const TUFT_DEFAULTS: TuftGrid = { rows: 3, cols: 3, depth: 0.5 }

/** Fraction of each half-extent kept clear of buttons at the edges, so the button
 *  grid never reaches the pinned seam corners (where a cushion doesn't tuft). */
export const TUFT_INSET = 0.22

/** In-plane footprint (m) of a tuft button decal. */
const TUFT_BUTTON_SIZE = 0.035

/** Minimum in-plane length (m) of a generated stitch-line decal (a degenerate
 *  edge-clamped diamond connection never collapses to an invisible sliver). */
const TUFT_STITCH_MIN = 0.04

/** Hard cap on generated stitch decals — the layout never exceeds ~2× the 36
 *  buttons (grid: ≤60, diamond: ≤55 at 6×6), but a bounded slice keeps the export
 *  cheap even if the button ranges widen later. */
export const TUFT_STITCH_MAX = 80

/** Plump crown / side-bow coefficients (× the smaller footprint). Kept here so the
 *  displacement is pure + testable; `plump.ts` reads them via `plumpVertexDelta`. */
const CROWN_K = 0.28
const BOW_K = 0.14

/** Clamp a (possibly user/garbage) grid into valid ranges. Pure. The optional
 *  Stage-10c fields are kept CLEAN: `pattern` is emitted only when `'diamond'`
 *  and `stitches` only when truthy, so a plain rectangular grid stays
 *  byte-identical to a Stage-7c tuft (no new keys). */
export function clampTuft(grid: TuftGrid): TuftGrid {
  const out: TuftGrid = {
    rows: clampCount(grid.rows),
    cols: clampCount(grid.cols),
    depth: clamp01(grid.depth),
  }
  if (grid.pattern === 'diamond') out.pattern = 'diamond'
  if (grid.stitches) out.stitches = true
  return out
}

/** N evenly-spaced coordinates along a centred axis of `extent`, inset from the
 *  edges by `TUFT_INSET`. A single point sits at the centre. Pure. */
function axisPositions(extent: number, n: number): number[] {
  const count = clampCount(n)
  const usable = (extent / 2) * (1 - TUFT_INSET)
  if (count <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(-usable + (2 * usable * i) / (count - 1))
  return out
}

/** Half the column spacing along X (the diamond row shift). 0 for a single column
 *  (nothing to offset). Pure. */
function halfColShift(w: number, cols: number): number {
  const c = clampCount(cols)
  const usable = (w / 2) * (1 - TUFT_INSET)
  return c > 1 ? usable / (c - 1) : 0
}

/** The button grid points on the top face, in the box's LOCAL XZ frame (centred).
 *  `cols` runs along X (width), `rows` along Z (depth). Length = rows × cols. For
 *  the `diamond` pattern (Stage 10c) every ODD row is shifted +half a column and
 *  edge-clamped to the inset window (the Chesterfield lattice); `grid` (default)
 *  is the plain rectangle. Row-major (all of row 0, then row 1, …). Pure. */
export function tuftButtonPositionsXZ(
  w: number,
  d: number,
  rows: number,
  cols: number,
  pattern: TuftPattern = 'grid',
): [number, number][] {
  const xs = axisPositions(w, cols)
  const zs = axisPositions(d, rows)
  const usableX = (w / 2) * (1 - TUFT_INSET)
  const shift = pattern === 'diamond' ? halfColShift(w, cols) : 0
  const out: [number, number][] = []
  zs.forEach((z, ri) => {
    const off = shift !== 0 && ri % 2 === 1 ? shift : 0
    for (const x of xs) out.push([off !== 0 ? clamp(x + off, -usableX, usableX) : x, z])
  })
  return out
}

/** The adjacent-button connections for a tuft grid, as row-major index pairs into
 *  `tuftButtonPositionsXZ`. `grid` → orthogonal neighbours (horizontal within a
 *  row + vertical between rows); `diamond` → the diagonal lattice (each button to
 *  the button directly below plus the one lateral diagonal, the direction keyed on
 *  which row is shifted). Bounded by `TUFT_STITCH_MAX`. Pure. */
export function tuftStitchPairs(
  rows: number,
  cols: number,
  pattern: TuftPattern = 'grid',
): [number, number][] {
  const r = clampCount(rows)
  const c = clampCount(cols)
  const idx = (row: number, col: number) => row * c + col
  const pairs: [number, number][] = []
  if (pattern === 'diamond') {
    for (let row = 0; row + 1 < r; row++) {
      const rowShifted = row % 2 === 1
      for (let col = 0; col < c; col++) {
        pairs.push([idx(row, col), idx(row + 1, col)]) // straight-down diagonal
        const lateral = rowShifted ? col + 1 : col - 1 // the one side diagonal
        if (lateral >= 0 && lateral < c) pairs.push([idx(row, col), idx(row + 1, lateral)])
      }
    }
  } else {
    for (let row = 0; row < r; row++)
      for (let col = 0; col + 1 < c; col++) pairs.push([idx(row, col), idx(row, col + 1)]) // ─
    for (let row = 0; row + 1 < r; row++)
      for (let col = 0; col < c; col++) pairs.push([idx(row, col), idx(row + 1, col)]) // │
  }
  return pairs.length > TUFT_STITCH_MAX ? pairs.slice(0, TUFT_STITCH_MAX) : pairs
}

/** Gaussian dimple radius (m) derived from the button spacing so neighbouring
 *  dimples read as distinct buttons rather than one broad valley. Pure. */
function tuftSigma(w: number, d: number, rows: number, cols: number): number {
  const c = clampCount(cols)
  const r = clampCount(rows)
  const sx = c > 1 ? (w * (1 - TUFT_INSET)) / (c - 1) : w * 0.5
  const sz = r > 1 ? (d * (1 - TUFT_INSET)) / (r - 1) : d * 0.5
  return Math.max(1e-3, Math.min(sx, sz) * 0.4)
}

/**
 * The plump displacement DELTA for one vertex `(x, y, z)` of a box of size
 * `[w, h, d]` at plump `amount` (0…1), plus optional tuft dimples. Pure — the
 * three-side of `applyPlump` just adds this to each vertex. With `tuft` absent
 * this is byte-identical to the pre-Stage-7c plump math (crown + side bow):
 *   - vertical CROWN, strongest on the top/bottom faces, fading to the pinned
 *     corners by the horizontal `cos` falloff;
 *   - side BOW, strongest on the side faces, fading toward the crowned faces.
 * A `tuft` grid SUBTRACTS a gaussian dimple from the TOP crown (y > 0) at each
 * button point, weighted by the same `ry²·cos·cos` term so corners stay pinned.
 */
export function plumpVertexDelta(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  amount: number,
  tuft?: TuftGrid,
): [number, number, number] {
  const a = clamp01(amount)
  if (a <= 0) return [0, 0, 0]
  const hx = Math.max(1e-4, w / 2)
  const hy = Math.max(1e-4, h / 2)
  const hz = Math.max(1e-4, d / 2)
  const crown = a * Math.min(w, d) * CROWN_K
  const bow = a * Math.min(w, d) * BOW_K
  const rx = clamp01(Math.abs(x) / hx)
  const ry = clamp01(Math.abs(y) / hy)
  const rz = clamp01(Math.abs(z) / hz)
  const cos = (r: number) => Math.cos((r * Math.PI) / 2)
  let dyMag = crown * (ry * ry) * cos(rx) * cos(rz)
  const dxMag = bow * (rx * rx) * cos(ry) * cos(rz)
  const dzMag = bow * (rz * rz) * cos(ry) * cos(rx)
  // Stage 7c: tuft dimples pull the TOP crown down at the button points. Same
  // ry²·cos·cos weighting as the crown → the pinned corners never move, and the
  // dimple only bites the top face (y > 0).
  if (tuft && y > 0 && crown > 0) {
    const depth = clamp01(tuft.depth)
    if (depth > 0) {
      const buttons = tuftButtonPositionsXZ(w, d, tuft.rows, tuft.cols, tuft.pattern ?? 'grid')
      const inv = 1 / (2 * tuftSigma(w, d, tuft.rows, tuft.cols) ** 2)
      let g = 0
      for (const [bx, bz] of buttons) {
        const ddx = x - bx
        const ddz = z - bz
        const e = Math.exp(-(ddx * ddx + ddz * ddz) * inv)
        if (e > g) g = e
      }
      dyMag -= crown * depth * g * (ry * ry) * cos(rx) * cos(rz)
    }
  }
  return [Math.sign(x) * dxMag, Math.sign(y) * dyMag, Math.sign(z) * dzMag]
}

/** The displaced TOP-surface height (local Y) at an XZ point of a plumped +
 *  optionally tufted box — where a tuft button sits. Pure. */
export function plumpTopSurfaceY(
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  amount: number,
  tuft?: TuftGrid,
): number {
  const top = h / 2
  return top + plumpVertexDelta(x, top, z, w, h, d, amount, tuft)[1]
}

/** The tagged `button` decals for a part's tuft grid (Stage 7c) — one per grid
 *  point, sitting IN its dimple (local Y from `plumpTopSurfaceY`). Empty when the
 *  part carries no tuft grid. Ids are minted by the caller (`addDecal`). Pure. */
export function tuftButtonDecals(part: ShapePart): Omit<Decal, 'id'>[] {
  const grid = part.tuft
  if (!grid) return []
  const { rows, cols, pattern } = clampTuft(grid)
  const [w, h, d] = part.size
  const amount = part.plump ?? 0
  return tuftButtonPositionsXZ(w, d, rows, cols, pattern ?? 'grid').map(([bx, bz]) => ({
    partId: part.id,
    position: [bx, plumpTopSurfaceY(bx, bz, w, h, d, amount, grid), bz] as [number, number, number],
    normal: [0, 1, 0] as [number, number, number],
    size: TUFT_BUTTON_SIZE,
    kind: 'button' as const,
    tuft: true,
  }))
}

/** The tagged `stitch` line decals connecting adjacent tuft buttons (Stage 10c) —
 *  one thin line per `tuftStitchPairs` connection, centred between the two buttons
 *  and rolled to the connection angle (the decal `rotation` field, in degrees;
 *  a top-face decal's long axis lands at `atan2(z, x) = −rotation`, so a line from
 *  A→B needs `rotation = −atan2(Δz, Δx)·180/π`). Empty when the part carries no
 *  tuft grid or `stitches` is off. A near-zero-length connection (an edge-clamped
 *  diamond pair) is skipped. Ids minted by the caller. Pure. */
export function tuftStitchDecals(part: ShapePart): Omit<Decal, 'id'>[] {
  const grid = part.tuft
  if (!grid?.stitches) return []
  const { rows, cols, pattern } = clampTuft(grid)
  const pat = pattern ?? 'grid'
  const [w, h, d] = part.size
  const amount = part.plump ?? 0
  const pts = tuftButtonPositionsXZ(w, d, rows, cols, pat)
  const out: Omit<Decal, 'id'>[] = []
  for (const [i, j] of tuftStitchPairs(rows, cols, pat)) {
    const a = pts[i]
    const b = pts[j]
    if (!a || !b) continue
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) continue
    const mx = (a[0] + b[0]) / 2
    const mz = (a[1] + b[1]) / 2
    out.push({
      partId: part.id,
      position: [mx, plumpTopSurfaceY(mx, mz, w, h, d, amount, grid), mz] as [
        number,
        number,
        number,
      ],
      normal: [0, 1, 0] as [number, number, number],
      size: Math.max(TUFT_STITCH_MIN, len),
      kind: 'stitch' as const,
      rotation: (-Math.atan2(dz, dx) * 180) / Math.PI,
      tuft: true,
    })
  }
  return out
}

/** Every tagged decal a tuft grid generates — the buttons plus (when `stitches`
 *  is on) the connecting stitch lines. The single generator `setTuftGrid` +
 *  template seeding use so buttons and stitches always regenerate together. Pure. */
export function tuftDecals(part: ShapePart): Omit<Decal, 'id'>[] {
  return [...tuftButtonDecals(part), ...tuftStitchDecals(part)]
}

/** Set the `decals` field, dropping it when empty so a spec stays byte-clean. */
function withDecals(spec: AssetEditSpec, list: Decal[]): AssetEditSpec {
  if (list.length === 0) {
    if (spec.decals === undefined) return spec
    const { decals: _drop, ...rest } = spec
    return rest
  }
  return { ...spec, decals: list }
}

/** Set (or clear, `grid: null`) a part's tufting immutably (Stage 7c; pattern +
 *  stitches added 10c). Removes the part's PREVIOUS tuft decals (tagged `tuft`, so
 *  user-placed decals are never touched), sets/clears the `tuft` field, then
 *  regenerates the tagged decals (buttons + optional stitch lines) for the new
 *  grid/pattern. One pure step → one undo entry. No-op for an unknown part id. */
export function setTuftGrid(
  spec: AssetEditSpec,
  partId: string,
  grid: TuftGrid | null,
): AssetEditSpec {
  if (!spec.parts.some((p) => p.id === partId)) return spec
  const cleaned = grid ? clampTuft(grid) : null
  // Drop this part's existing tuft buttons (user decals untouched).
  const kept = decals(spec).filter((dd) => !(dd.partId === partId && dd.tuft))
  let next = withDecals(spec, kept)
  // Set / clear the tuft field on the part.
  next = {
    ...next,
    parts: next.parts.map((p) => {
      if (p.id !== partId) return p
      if (!cleaned) {
        const { tuft: _drop, ...rest } = p
        return rest
      }
      return { ...p, tuft: cleaned }
    }),
  }
  if (!cleaned) return next
  // Regenerate the tagged button grid from the (now-tufted) part.
  const target = next.parts.find((p) => p.id === partId)
  if (!target) return next
  let cur = next
  for (const dec of tuftDecals(target)) cur = addDecal(cur, dec).spec
  return cur
}
