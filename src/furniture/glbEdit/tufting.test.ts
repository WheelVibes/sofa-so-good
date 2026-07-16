import { describe, expect, it } from 'vitest'
import {
  addDecal,
  createEmptySpec,
  type Decal,
  duplicatePart,
  newPartId,
  type ShapePart,
} from './editSpec'
import {
  clampTuft,
  plumpTopSurfaceY,
  plumpVertexDelta,
  setTuftGrid,
  TUFT_INSET,
  TUFT_STITCH_MAX,
  tuftButtonDecals,
  tuftButtonPositionsXZ,
  tuftDecals,
  tuftStitchDecals,
  tuftStitchPairs,
} from './tufting'

const box = (extra: Partial<ShapePart> = {}): ShapePart => ({
  id: newPartId(),
  kind: 'box',
  position: [0, 0.4, 0],
  size: [1.2, 0.12, 0.5],
  color: '#888',
  plump: 0.7,
  ...extra,
})

describe('tuft button grid math', () => {
  it('lays out rows × cols points, inset from the edges, centred', () => {
    const w = 1.2
    const d = 0.5
    const pts = tuftButtonPositionsXZ(w, d, 2, 3)
    expect(pts.length).toBe(6) // rows × cols
    const maxX = Math.max(...pts.map((p) => Math.abs(p[0])))
    const maxZ = Math.max(...pts.map((p) => Math.abs(p[1])))
    // Every button is inside the inset window (never at the pinned corners).
    expect(maxX).toBeLessThanOrEqual((w / 2) * (1 - TUFT_INSET) + 1e-9)
    expect(maxZ).toBeLessThanOrEqual((d / 2) * (1 - TUFT_INSET) + 1e-9)
    // The grid is symmetric about the centre on both axes.
    expect(pts.reduce((s, p) => s + p[0], 0)).toBeCloseTo(0, 6)
    expect(pts.reduce((s, p) => s + p[1], 0)).toBeCloseTo(0, 6)
  })

  it('a single row/col sits at the centre', () => {
    expect(tuftButtonPositionsXZ(1, 1, 1, 1)).toEqual([[0, 0]])
  })

  it('clamps rows/cols to 1–6 and depth to 0…1', () => {
    expect(clampTuft({ rows: 99, cols: 0, depth: 5 })).toEqual({ rows: 6, cols: 1, depth: 1 })
    expect(clampTuft({ rows: -3, cols: 2.4, depth: -1 })).toEqual({ rows: 1, cols: 2, depth: 0 })
  })
})

describe('plump tuft dimples (geometry)', () => {
  const w = 1.2
  const h = 0.12
  const d = 0.5

  it('a tuft dimple pulls the button centre BELOW the surrounding crown', () => {
    const tuft = { rows: 1, cols: 1, depth: 0.8 }
    const crownNoTuft = plumpTopSurfaceY(0, 0, w, h, d, 0.7)
    const atButton = plumpTopSurfaceY(0, 0, w, h, d, 0.7, tuft)
    // The dimple lowers the crown at the button.
    expect(atButton).toBeLessThan(crownNoTuft)
    // A point far from the (single, central) button keeps its full crown → higher.
    const far = plumpTopSurfaceY((w / 2) * (1 - TUFT_INSET), 0, w, h, d, 0.7, tuft)
    // Compare against the SAME point without the (distant) dimple influence — the
    // edge point is only mildly dimpled, so it stays well above the button centre.
    expect(far).toBeGreaterThan(atButton)
  })

  it('deeper depth digs a deeper dimple (monotonic)', () => {
    const shallow = plumpTopSurfaceY(0, 0, w, h, d, 0.7, { rows: 1, cols: 1, depth: 0.3 })
    const deep = plumpTopSurfaceY(0, 0, w, h, d, 0.7, { rows: 1, cols: 1, depth: 0.9 })
    expect(deep).toBeLessThan(shallow)
  })

  it('depth 0 leaves the crown untouched (buttons only)', () => {
    const noTuft = plumpTopSurfaceY(0.1, 0.05, w, h, d, 0.7)
    const zeroDepth = plumpTopSurfaceY(0.1, 0.05, w, h, d, 0.7, { rows: 2, cols: 3, depth: 0 })
    expect(zeroDepth).toBeCloseTo(noTuft, 9)
  })

  it('keeps the four corners pinned even with tufting', () => {
    const tuft = { rows: 2, cols: 3, depth: 1 }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const [dx, dy, dz] = plumpVertexDelta((sx * w) / 2, h / 2, (sz * d) / 2, w, h, d, 0.7, tuft)
        expect(Math.abs(dx)).toBeLessThan(1e-6)
        expect(Math.abs(dy)).toBeLessThan(1e-6)
        expect(Math.abs(dz)).toBeLessThan(1e-6)
      }
    }
  })

  it('never dimples the bottom face (dimple is top-only)', () => {
    const tuft = { rows: 2, cols: 2, depth: 1 }
    // A bottom-face vertex (y < 0): its crown is the same with or without tuft.
    const withTuft = plumpVertexDelta(0, -h / 2, 0, w, h, d, 0.7, tuft)
    const noTuft = plumpVertexDelta(0, -h / 2, 0, w, h, d, 0.7)
    expect(withTuft[1]).toBeCloseTo(noTuft[1], 9)
  })
})

describe('tuft button decals', () => {
  it('emits one tagged button decal per grid point, sitting in its dimple', () => {
    const part = box({ tuft: { rows: 2, cols: 3, depth: 0.6 } })
    const list = tuftButtonDecals(part)
    expect(list.length).toBe(6)
    for (const dcl of list) {
      expect(dcl.kind).toBe('button')
      expect(dcl.tuft).toBe(true)
      expect(dcl.partId).toBe(part.id)
      // The button's local Y is the dimpled top-surface height.
      expect(dcl.position[1]).toBeCloseTo(
        plumpTopSurfaceY(
          dcl.position[0],
          dcl.position[2],
          ...part.size,
          part.plump ?? 0,
          part.tuft,
        ),
        9,
      )
      // Normal points up (the top face).
      expect(dcl.normal).toEqual([0, 1, 0])
    }
  })

  it('a part without a tuft grid emits none', () => {
    expect(tuftButtonDecals(box({ tuft: undefined })).length).toBe(0)
  })
})

describe('setTuftGrid (spec op): regeneration + tagging', () => {
  it('adds a tagged button grid and sets the part field', () => {
    const part = box()
    const spec = { ...createEmptySpec(), parts: [part] }
    const next = setTuftGrid(spec, part.id, { rows: 2, cols: 2, depth: 0.5 })
    expect(next.parts[0].tuft).toEqual({ rows: 2, cols: 2, depth: 0.5 })
    const tuftDecals = (next.decals ?? []).filter((dd) => dd.tuft)
    expect(tuftDecals.length).toBe(4)
    expect(tuftDecals.every((dd) => dd.partId === part.id && dd.kind === 'button')).toBe(true)
  })

  it('editing rows/cols REPLACES the previous tuft decals (count changes)', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 2, depth: 0.5 })
    const firstIds = new Set((spec.decals ?? []).map((dd) => dd.id))
    expect((spec.decals ?? []).length).toBe(4)
    spec = setTuftGrid(spec, part.id, { rows: 3, cols: 3, depth: 0.5 })
    const tuftDecals = (spec.decals ?? []).filter((dd) => dd.tuft)
    expect(tuftDecals.length).toBe(9) // regenerated to the new grid
    // The old tuft decals are gone (fresh ids), not stacked on top.
    expect(tuftDecals.some((dd) => firstIds.has(dd.id))).toBe(false)
  })

  it('never touches user-placed decals on the same part', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    // A hand-placed (non-tuft) stitch decal on the part.
    const userDecal: Omit<Decal, 'id'> = {
      partId: part.id,
      position: [0, 0.06, 0.1],
      normal: [0, 1, 0],
      size: 0.1,
      kind: 'stitch',
    }
    spec = addDecal(spec, userDecal).spec
    const userId = spec.decals![0].id
    // Add tufting, then change it, then clear it — the user decal survives all.
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 2, depth: 0.5 })
    spec = setTuftGrid(spec, part.id, { rows: 3, cols: 2, depth: 0.5 })
    spec = setTuftGrid(spec, part.id, null)
    const survivors = spec.decals ?? []
    expect(survivors.length).toBe(1)
    expect(survivors[0].id).toBe(userId)
    expect(survivors[0].kind).toBe('stitch')
    // The tuft field is cleared and no tuft decals remain.
    expect(spec.parts[0].tuft).toBeUndefined()
    expect(survivors.some((dd) => dd.tuft)).toBe(false)
  })

  it('clearing tufting on the only decal source drops the decals field entirely', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 2, depth: 0.5 })
    expect(spec.decals).toBeDefined()
    spec = setTuftGrid(spec, part.id, null)
    expect(spec.decals).toBeUndefined()
  })

  it('is a no-op for an unknown part id', () => {
    const spec = { ...createEmptySpec(), parts: [box()] }
    expect(setTuftGrid(spec, 'nope', { rows: 2, cols: 2, depth: 0.5 })).toBe(spec)
  })
})

describe('diamond pattern layout (Stage 10c)', () => {
  const w = 1.2
  const d = 0.5

  it('clampTuft keeps pattern/stitches clean (grid + off drop their keys)', () => {
    // A plain grid stays byte-identical to a Stage-7c tuft (no new keys).
    expect(clampTuft({ rows: 3, cols: 3, depth: 0.5 })).toEqual({ rows: 3, cols: 3, depth: 0.5 })
    expect(clampTuft({ rows: 3, cols: 3, depth: 0.5, pattern: 'grid', stitches: false })).toEqual({
      rows: 3,
      cols: 3,
      depth: 0.5,
    })
    // Diamond + stitches are preserved.
    expect(clampTuft({ rows: 2, cols: 3, depth: 0.5, pattern: 'diamond', stitches: true })).toEqual(
      { rows: 2, cols: 3, depth: 0.5, pattern: 'diamond', stitches: true },
    )
  })

  it('offsets every ODD row by half a column, edge-clamped; count unchanged', () => {
    const rows = 3
    const cols = 3
    const grid = tuftButtonPositionsXZ(w, d, rows, cols, 'grid')
    const diamond = tuftButtonPositionsXZ(w, d, rows, cols, 'diamond')
    expect(diamond.length).toBe(rows * cols) // same count as the grid
    const usableX = (w / 2) * (1 - TUFT_INSET)
    const halfCol = usableX / (cols - 1)
    for (let ri = 0; ri < rows; ri++) {
      for (let c = 0; c < cols; c++) {
        const g = grid[ri * cols + c]
        const dm = diamond[ri * cols + c]
        expect(dm[1]).toBeCloseTo(g[1], 9) // Z (row) is unchanged
        const off = ri % 2 === 1 ? halfCol : 0
        expect(dm[0]).toBeCloseTo(Math.min(usableX, Math.max(-usableX, g[0] + off)), 9)
      }
    }
    // No button escapes the inset window (edge-clamped).
    expect(Math.max(...diamond.map((p) => Math.abs(p[0])))).toBeLessThanOrEqual(usableX + 1e-9)
  })

  it('even rows are identical to the grid (only odd rows shift)', () => {
    const diamond = tuftButtonPositionsXZ(w, d, 2, 3, 'diamond')
    const grid = tuftButtonPositionsXZ(w, d, 2, 3, 'grid')
    // Row 0 (even) matches the grid exactly.
    for (let c = 0; c < 3; c++) expect(diamond[c][0]).toBeCloseTo(grid[c][0], 9)
    // Row 1 (odd) is shifted right of the grid row.
    for (let c = 0; c < 2; c++) expect(diamond[3 + c][0]).toBeGreaterThan(grid[3 + c][0])
  })

  it('a diamond dimple still pins the four corners (top-only, corners fixed)', () => {
    const h = 0.12
    const tuft = { rows: 2, cols: 3, depth: 1, pattern: 'diamond' as const }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const [dx, dy, dz] = plumpVertexDelta((sx * w) / 2, h / 2, (sz * d) / 2, w, h, d, 0.7, tuft)
        expect(Math.abs(dx)).toBeLessThan(1e-6)
        expect(Math.abs(dy)).toBeLessThan(1e-6)
        expect(Math.abs(dz)).toBeLessThan(1e-6)
      }
    }
  })
})

describe('tuft stitch pairs + decals (Stage 10c)', () => {
  it('grid connects orthogonal neighbours (horizontals + verticals)', () => {
    const pairs = tuftStitchPairs(2, 3, 'grid')
    // rows*(cols-1) horizontals + (rows-1)*cols verticals = 4 + 3.
    expect(pairs.length).toBe(2 * 2 + 1 * 3)
    // A 6×6 grid stays within the cap.
    const big = tuftStitchPairs(6, 6, 'grid')
    expect(big.length).toBe(6 * 5 + 5 * 6) // 60
    expect(big.length).toBeLessThanOrEqual(TUFT_STITCH_MAX)
  })

  it('diamond connects the diagonal lattice (straight-down + one lateral)', () => {
    // 2×3: one row pair, row 0 unshifted → 3 straight + 2 laterals (cols 1,2).
    expect(tuftStitchPairs(2, 3, 'diamond').length).toBe(5)
    // 3×3: two row pairs, 5 each.
    expect(tuftStitchPairs(3, 3, 'diamond').length).toBe(10)
    // Never exceeds the cap.
    expect(tuftStitchPairs(6, 6, 'diamond').length).toBeLessThanOrEqual(TUFT_STITCH_MAX)
  })

  it('stitch decals sit at button midpoints, tagged, rolled to the connection angle', () => {
    const part = box({ tuft: { rows: 2, cols: 3, depth: 0.5, stitches: true } })
    const pts = tuftButtonPositionsXZ(part.size[0], part.size[2], 2, 3, 'grid')
    const stitches = tuftStitchDecals(part)
    expect(stitches.length).toBe(tuftStitchPairs(2, 3, 'grid').length)
    for (const s of stitches) {
      expect(s.kind).toBe('stitch')
      expect(s.tuft).toBe(true)
      expect(s.partId).toBe(part.id)
      expect(s.normal).toEqual([0, 1, 0])
      expect(Number.isFinite(s.rotation)).toBe(true)
    }
    // The first grid pair is horizontal (button 0 → button 1): Δz = 0 → roll 0.
    const [i, j] = tuftStitchPairs(2, 3, 'grid')[0]
    const mid = [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2]
    const horiz = stitches[0]
    expect(horiz.position[0]).toBeCloseTo(mid[0], 9)
    expect(horiz.position[2]).toBeCloseTo(mid[1], 9)
    expect(horiz.rotation).toBeCloseTo(0, 6)
  })

  it('a diamond stitch runs on a diagonal (roll is not axis-aligned)', () => {
    const part = box({ tuft: { rows: 2, cols: 3, depth: 0.5, pattern: 'diamond', stitches: true } })
    const stitches = tuftStitchDecals(part)
    expect(stitches.length).toBeGreaterThan(0)
    // At least one stitch is a true diagonal (roll not a multiple of 90°).
    const mod90 = (r: number) => ((r % 90) + 90) % 90
    expect(stitches.some((s) => mod90(s.rotation ?? 0) > 1 && mod90(s.rotation ?? 0) < 89)).toBe(
      true,
    )
  })

  it('no stitches when the toggle is off or the part has no grid', () => {
    expect(tuftStitchDecals(box({ tuft: { rows: 2, cols: 3, depth: 0.5 } }))).toEqual([])
    expect(tuftStitchDecals(box({ tuft: undefined }))).toEqual([])
  })

  it('tuftDecals bundles buttons + stitches (buttons only when stitches off)', () => {
    const noStitch = box({ tuft: { rows: 2, cols: 3, depth: 0.5 } })
    expect(tuftDecals(noStitch).length).toBe(6) // buttons only
    const withStitch = box({ tuft: { rows: 2, cols: 3, depth: 0.5, stitches: true } })
    expect(tuftDecals(withStitch).length).toBe(6 + tuftStitchPairs(2, 3, 'grid').length)
    expect(tuftDecals(withStitch).every((dd) => dd.tuft)).toBe(true)
  })
})

describe('setTuftGrid regeneration for pattern + stitches (Stage 10c)', () => {
  it('turning stitches on adds tagged stitch decals alongside the buttons', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 3, depth: 0.5 })
    expect((spec.decals ?? []).filter((dd) => dd.kind === 'stitch').length).toBe(0)
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 3, depth: 0.5, stitches: true })
    const buttons = (spec.decals ?? []).filter((dd) => dd.tuft && dd.kind === 'button')
    const lines = (spec.decals ?? []).filter((dd) => dd.tuft && dd.kind === 'stitch')
    expect(buttons.length).toBe(6)
    expect(lines.length).toBe(tuftStitchPairs(2, 3, 'grid').length)
  })

  it('switching grid → diamond REPLACES the tuft decals (fresh ids)', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    spec = setTuftGrid(spec, part.id, { rows: 3, cols: 3, depth: 0.5, stitches: true })
    const before = new Set((spec.decals ?? []).map((dd) => dd.id))
    spec = setTuftGrid(spec, part.id, {
      rows: 3,
      cols: 3,
      depth: 0.5,
      pattern: 'diamond',
      stitches: true,
    })
    expect(spec.parts[0].tuft?.pattern).toBe('diamond')
    const after = (spec.decals ?? []).filter((dd) => dd.tuft)
    expect(after.some((dd) => before.has(dd.id))).toBe(false) // all replaced
    expect(after.filter((dd) => dd.kind === 'button').length).toBe(9)
    expect(after.filter((dd) => dd.kind === 'stitch').length).toBe(
      tuftStitchPairs(3, 3, 'diamond').length,
    )
  })
})

describe('duplicate deep-copies the tuft grid + its buttons', () => {
  it('a duplicated tufted part carries its own tuft grid + button decals', () => {
    const part = box()
    let spec = { ...createEmptySpec(), parts: [part] }
    spec = setTuftGrid(spec, part.id, { rows: 2, cols: 2, depth: 0.5 })
    const dup = duplicatePart(spec, part.id)
    const clone = dup.parts.find((p) => p.id !== part.id)!
    expect(clone.tuft).toEqual({ rows: 2, cols: 2, depth: 0.5 })
    // Mutating the clone's grid must not affect the source (deep copy).
    clone.tuft!.rows = 5
    expect(spec.parts[0].tuft!.rows).toBe(2)
    // The source's tuft buttons were cloned onto the copy (still 4 each).
    const cloneButtons = (dup.decals ?? []).filter((dd) => dd.partId === clone.id && dd.tuft)
    expect(cloneButtons.length).toBe(4)
  })
})
