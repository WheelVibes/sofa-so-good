import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { mirrorItemX } from '../layout/mirrorRoom'
import { obbVsObb } from './obb'
import {
  canPlace,
  findItemOverlaps,
  itemAabbBox,
  itemFootprint,
  itemFootprintParts,
  itemFootprintPartsLocal,
  itemFootprintSpanLocal,
} from './placement'

/**
 * Granular, shape-aware collision (composite footprints): a non-rectangular
 * piece collides by its true plan shape (a list of convex parts), not by one
 * enclosing bounding box — so something can sit in an L-sofa's concave notch.
 */

// A tiny rectangular probe piece (0.4 × 0.4) with no parts → single OBB.
const probeDef: BuiltinGltfDef = {
  id: 'probe',
  name: 'Probe',
  category: 'decor',
  kind: 'gltf',
  source: 'builtin',
  url: '/none.glb',
  license: 'CC0',
  defaultFootprint: { w: 0.4, d: 0.4, h: 0.4 },
}

const probeAt = (cx: number, cz: number): FurnitureItem => ({
  id: 'p1',
  defId: 'probe',
  position: [cx, cz],
  rotation: 0,
  props: {},
})

const lsofa = (props: FurnitureItem['props'] = {}): FurnitureItem => ({
  id: 'L1',
  defId: 'sofa-lshape',
  position: [0, 0],
  rotation: 0,
  props,
})

// Furniture-only context (no walls) so we isolate part-vs-part behaviour.
const defs: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG, probe: probeDef }
const ctx = (others: FurnitureItem[]) => ({ others, defs, doors: {}, walls: [] })

describe('granular footprint — itemFootprintParts', () => {
  it('returns a single OBB equal to itemFootprint when the def has no parts', () => {
    const parts = itemFootprintParts(probeAt(1, 2), probeDef)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual(itemFootprint(probeAt(1, 2), probeDef))
  })

  it('decomposes the L-shaped sectional into 2 parts (main run + chaise)', () => {
    const parts = itemFootprintParts(lsofa(), BUILTIN_CATALOG['sofa-lshape'])
    expect(parts).toHaveLength(2)
    // Main run spans the full width; chaise is narrower (one depth wide).
    expect(parts[0].hx * 2).toBeCloseTo(2.5, 6)
    expect(parts[1].hx * 2).toBeCloseTo(0.95, 6)
  })
})

describe('granular footprint — L-sofa concave notch', () => {
  const Ldef = BUILTIN_CATALOG['sofa-lshape']

  it('lets a piece sit in the open notch that the bounding box would block', () => {
    const sofa = lsofa()
    const probe = probeAt(-0.7, 0.5) // forward-left: inside bbox, outside both parts
    // Granular collision: allowed.
    expect(canPlace(probe, probeDef, ctx([sofa]))).toBe(true)
    // …but the single enclosing boxes DO overlap — proving granularity is what
    // makes the difference (not just that they're far apart).
    expect(obbVsObb(itemFootprint(probe, probeDef), itemFootprint(sofa, Ldef))).toBe(true)
  })

  it('still blocks a piece placed on the chaise return', () => {
    expect(canPlace(probeAt(0.8, 0.5), probeDef, ctx([lsofa()]))).toBe(false)
  })

  it('still blocks a piece placed on the main run', () => {
    expect(canPlace(probeAt(0, -0.5), probeDef, ctx([lsofa()]))).toBe(false)
  })

  it('mirrors the notch when the chaise is on the left', () => {
    const left = lsofa({ chaiseSide: 'left' })
    // Notch is now forward-RIGHT → free; forward-LEFT is the chaise → blocked.
    expect(canPlace(probeAt(0.7, 0.5), probeDef, ctx([left]))).toBe(true)
    expect(canPlace(probeAt(-0.8, 0.5), probeDef, ctx([left]))).toBe(false)
  })

  it('findItemOverlaps reports no overlap for a piece in the notch', () => {
    const sofa = lsofa()
    const probe = probeAt(-0.7, 0.5)
    const overlaps = findItemOverlaps([sofa, probe], defs)
    expect(overlaps).toHaveLength(0)
  })
})

describe('granular footprint — L-shaped corner base cabinet', () => {
  const cornerAt = (cx: number, cz: number, rot = 0): FurnitureItem => ({
    id: 'cc',
    defId: 'cabinet-corner',
    position: [cx, cz],
    rotation: rot,
    props: {},
  })

  it('decomposes into 2 perpendicular runs', () => {
    expect(itemFootprintParts(cornerAt(0, 0), BUILTIN_CATALOG['cabinet-corner'])).toHaveLength(2)
  })

  it('leaves the inner corner open (an adjacent piece can sit in the +X/+Z quadrant)', () => {
    // Default S=1, d=0.6 → inner open quadrant is X(-0.2..0.5) × Z(-0.2..0.5).
    // A small probe at (0.3, 0.3) is inside the bounding square but in the open corner.
    expect(canPlace(probeAt(0.3, 0.3), probeDef, ctx([cornerAt(0, 0)]))).toBe(true)
    // But the enclosing boxes overlap — granularity is the difference.
    expect(
      obbVsObb(
        itemFootprint(probeAt(0.3, 0.3), probeDef),
        itemFootprint(cornerAt(0, 0), BUILTIN_CATALOG['cabinet-corner']),
      ),
    ).toBe(true)
  })

  it('still blocks a piece on either run (back / left leg)', () => {
    // On run A (back, along −Z): (0, -0.35) is inside the back leg.
    expect(canPlace(probeAt(0, -0.35), probeDef, ctx([cornerAt(0, 0)]))).toBe(false)
    // On run B (left leg, along −X): (-0.35, 0.2) is inside the left leg.
    expect(canPlace(probeAt(-0.35, 0.2), probeDef, ctx([cornerAt(0, 0)]))).toBe(false)
  })
})

describe('granular footprint — broadphase AABB encloses every part (superset invariant)', () => {
  // The broadphase grid must be a SUPERSET of the narrowphase, or it prunes a
  // real overlap. itemAabbBox therefore unions all part AABBs — regression for
  // the L-sofa, whose enclosing itemFootprint OBB (read from `depth`) is
  // *shallower* than the true main-run+chaise shape (BUG v0.9.0.9).
  const partAabb = (p: { cx: number; cz: number; hx: number; hz: number; rot: number }) => {
    const c = Math.abs(Math.cos(p.rot))
    const s = Math.abs(Math.sin(p.rot))
    const hx = c * p.hx + s * p.hz
    const hz = s * p.hx + c * p.hz
    return { minX: p.cx - hx, minZ: p.cz - hz, maxX: p.cx + hx, maxZ: p.cz + hz }
  }

  it('the L-sofa AABB bounds both parts (incl. the chaise that depth omits)', () => {
    const sofa = lsofa()
    const def = BUILTIN_CATALOG['sofa-lshape']
    const box = itemAabbBox(sofa, def)
    for (const p of itemFootprintParts(sofa, def)) {
      const a = partAabb(p)
      expect(box.minX).toBeLessThanOrEqual(a.minX + 1e-9)
      expect(box.minZ).toBeLessThanOrEqual(a.minZ + 1e-9)
      expect(box.maxX).toBeGreaterThanOrEqual(a.maxX - 1e-9)
      expect(box.maxZ).toBeGreaterThanOrEqual(a.maxZ - 1e-9)
    }
  })

  it('the L-sofa AABB is deeper than the single enclosing OBB when depth is set', () => {
    // The real-world trigger (preset props): an explicit shallow `depth` makes
    // itemFootprint a thin 0.95 m box, but the chaise still extends the true
    // shape to ~1.95 m — the AABB must follow the parts, not the OBB.
    const sofa = lsofa({ width: 2.6, depth: 0.95, chaise: 1.0 })
    const def = BUILTIN_CATALOG['sofa-lshape']
    const box = itemAabbBox(sofa, def)
    const obb = itemFootprint(sofa, def) // depth-only: 0.95 deep, centred
    expect(box.maxZ - box.minZ).toBeGreaterThan(obb.hz * 2 + 0.5)
  })

  it('rotates with the item (90° AABB still bounds the parts)', () => {
    const sofa = { ...lsofa(), rotation: Math.PI / 2 }
    const def = BUILTIN_CATALOG['sofa-lshape']
    const box = itemAabbBox(sofa, def)
    for (const p of itemFootprintParts(sofa, def)) {
      const a = partAabb(p)
      expect(box.minX).toBeLessThanOrEqual(a.minX + 1e-9)
      expect(box.maxX).toBeGreaterThanOrEqual(a.maxX - 1e-9)
    }
  })
})

describe('granular footprint — local parts (for selection / ghost tint overlay)', () => {
  it('returns one centred part equal to the footprint for a plain piece', () => {
    const local = itemFootprintPartsLocal(probeAt(3, 4), probeDef)
    expect(local).toHaveLength(1)
    expect(local[0]).toEqual({ ox: 0, oz: 0, hx: 0.2, hz: 0.2, rot: 0 })
  })

  it('is yaw-independent (local frame) — same parts at any item rotation', () => {
    const a = itemFootprintPartsLocal(lsofa(), BUILTIN_CATALOG['sofa-lshape'])
    const b = itemFootprintPartsLocal(
      { ...lsofa(), rotation: Math.PI / 3 },
      BUILTIN_CATALOG['sofa-lshape'],
    )
    expect(a).toEqual(b)
  })

  it('decomposes the L-sofa into 2 local parts offset from the centre', () => {
    const local = itemFootprintPartsLocal(lsofa(), BUILTIN_CATALOG['sofa-lshape'])
    expect(local).toHaveLength(2)
    // Main run sits behind the centre (−Z), chaise ahead (+Z): opposite signs.
    expect(Math.sign(local[0].oz)).toBe(-1)
    expect(Math.sign(local[1].oz)).toBe(1)
    // Chaise is offset to one side (non-zero X); main run is centred in X.
    expect(local[0].ox).toBeCloseTo(0, 6)
    expect(Math.abs(local[1].ox)).toBeGreaterThan(0.1)
  })

  it('applies item scale to local part offsets + extents', () => {
    const local = itemFootprintPartsLocal(
      { id: 'b', defId: 'barbell-x', position: [0, 0], rotation: 0, props: { scaleX: 2 } },
      {
        id: 'barbell-x',
        name: 'B',
        category: 'decor',
        kind: 'gltf',
        source: 'builtin',
        url: '/none.glb',
        license: 'CC0',
        defaultFootprint: { w: 2, d: 1, h: 1 },
        footprintParts: [
          { dx: -0.75, dz: 0, w: 0.5, d: 1 },
          { dx: 0.75, dz: 0, w: 0.5, d: 1 },
        ],
      },
    )
    expect(local.map((p) => p.ox).sort((a, b) => a - b)).toEqual([-1.5, 1.5])
    expect(local[0].hx * 2).toBeCloseTo(1, 6)
  })
})

describe('granular footprint — minimum spanning box (selection / resize handles)', () => {
  it('equals the enclosing footprint for a plain piece (centred)', () => {
    const span = itemFootprintSpanLocal(probeAt(2, 2), probeDef)
    expect(span).toEqual({ ox: 0, oz: 0, hx: 0.2, hz: 0.2 })
  })

  it('spans the L-sofa true depth (main run + chaise), deeper than its OBB', () => {
    const sofa = lsofa({ width: 2.6, depth: 0.95, chaise: 1.0 })
    const def = BUILTIN_CATALOG['sofa-lshape']
    const span = itemFootprintSpanLocal(sofa, def)
    const obb = itemFootprint(sofa, def)
    // Full width preserved; depth is the true ~1.95 m, not the 0.95 m OBB.
    expect(span.hx * 2).toBeCloseTo(2.6, 6)
    expect(span.hz * 2).toBeCloseTo(1.95, 6)
    expect(span.hz).toBeGreaterThan(obb.hz + 0.4)
  })

  it('bounds every footprint part (local)', () => {
    const sofa = lsofa()
    const def = BUILTIN_CATALOG['sofa-lshape']
    const span = itemFootprintSpanLocal(sofa, def)
    for (const p of itemFootprintPartsLocal(sofa, def)) {
      expect(Math.abs(p.ox) + p.hx).toBeLessThanOrEqual(Math.abs(span.ox) + span.hx + 1e-9)
      expect(p.oz + p.hz).toBeLessThanOrEqual(span.oz + span.hz + 1e-9)
      expect(p.oz - p.hz).toBeGreaterThanOrEqual(span.oz - span.hz - 1e-9)
    }
  })

  it('applies item scale', () => {
    const def = BUILTIN_CATALOG['sofa-lshape']
    const base = itemFootprintSpanLocal(lsofa(), def)
    const scaled = itemFootprintSpanLocal({ ...lsofa(), props: { scaleX: 2 } }, def)
    expect(scaled.hx).toBeCloseTo(base.hx * 2, 6)
  })
})

describe('granular footprint — static parts + transforms', () => {
  // Two 0.5×1 blocks with a 1 m gap between their inner edges (centres ±0.75),
  // inside a 2×1 enclosing bbox — a barbell shape with an open middle.
  const barbell: BuiltinGltfDef = {
    id: 'barbell',
    name: 'Barbell',
    category: 'decor',
    kind: 'gltf',
    source: 'builtin',
    url: '/none.glb',
    license: 'CC0',
    defaultFootprint: { w: 2, d: 1, h: 1 },
    footprintParts: [
      { dx: -0.75, dz: 0, w: 0.5, d: 1 },
      { dx: 0.75, dz: 0, w: 0.5, d: 1 },
    ],
  }
  const bDefs: Record<string, FurnitureDef> = { ...defs, barbell }
  const bAt = (cx: number, cz: number, rot = 0): FurnitureItem => ({
    id: 'bar',
    defId: 'barbell',
    position: [cx, cz],
    rotation: rot,
    props: {},
  })

  it('honours a static parts array — gap in the middle is free', () => {
    // Probe at the centre: inside the bbox, between the two blocks → allowed.
    expect(
      canPlace(probeAt(0, 0), probeDef, { others: [bAt(0, 0)], defs: bDefs, doors: {}, walls: [] }),
    ).toBe(true)
    // On a block (centre 0.75) → blocked.
    expect(
      canPlace(probeAt(0.75, 0), probeDef, {
        others: [bAt(0, 0)],
        defs: bDefs,
        doors: {},
        walls: [],
      }),
    ).toBe(false)
  })

  it('applies item scale to each part', () => {
    const parts = itemFootprintParts(
      { id: 'b', defId: 'barbell', position: [0, 0], rotation: 0, props: { scaleX: 2 } },
      barbell,
    )
    // Each block's centre offset doubles (±1.5) and width doubles (0.5 → 1).
    expect(parts.map((p) => p.cx).sort((a, b) => a - b)).toEqual([-1.5, 1.5])
    expect(parts[0].hx * 2).toBeCloseTo(1, 6)
  })

  it('applies item rotation to each part', () => {
    // 90° rotation: the parts that were offset along X are now offset along Z.
    const parts = itemFootprintParts(bAt(0, 0, Math.PI / 2), barbell)
    expect(parts.map((p) => p.cz).sort((a, b) => a - b)).toEqual([-0.75, 0.75])
    for (const p of parts) expect(p.cx).toBeCloseTo(0, 6)
  })
})

describe('granular footprint — flip mirrors an asymmetric footprint (BUG: sofa-lshape-chaiseSide-flip)', () => {
  const Ldef = BUILTIN_CATALOG['sofa-lshape']

  it('flipping the default (right-chaise) sofa matches the un-flipped left-chaise footprint', () => {
    // `Furniture.tsx` renders a flip as a scale mirror around the primitive, so
    // the visual chaise swaps sides on flipX without `chaiseSide` changing. The
    // footprint must land on the same side the render now shows it.
    const flipped = itemFootprintParts({ ...lsofa(), flipX: true }, Ldef)
    const mirroredProp = itemFootprintParts(lsofa({ chaiseSide: 'left' }), Ldef)
    const byHx = (a: { hx: number }, b: { hx: number }) => a.hx - b.hx
    const flippedSorted = [...flipped].sort(byHx)
    const mirroredSorted = [...mirroredProp].sort(byHx)
    for (let i = 0; i < flippedSorted.length; i++) {
      expect(flippedSorted[i].cx).toBeCloseTo(mirroredSorted[i].cx, 6)
      expect(flippedSorted[i].cz).toBeCloseTo(mirroredSorted[i].cz, 6)
      expect(flippedSorted[i].hx).toBeCloseTo(mirroredSorted[i].hx, 6)
      expect(flippedSorted[i].hz).toBeCloseTo(mirroredSorted[i].hz, 6)
    }
  })

  it('collision follows the flip: the notch moves to the mirrored side', () => {
    const flipped = { ...lsofa(), flipX: true }
    // Un-flipped (chaise right): notch is forward-LEFT, chaise blocks forward-RIGHT.
    // Flipped: the chaise is now forward-LEFT, so forward-RIGHT opens up instead.
    expect(canPlace(probeAt(0.7, 0.5), probeDef, ctx([flipped]))).toBe(true)
    expect(canPlace(probeAt(-0.8, 0.5), probeDef, ctx([flipped]))).toBe(false)
  })

  it('flipZ mirrors the main-run/chaise split front-to-back', () => {
    const flipped = itemFootprintParts({ ...lsofa(), flipZ: true }, Ldef)
    const base = itemFootprintParts(lsofa(), Ldef)
    const byHx = (a: { hx: number }, b: { hx: number }) => a.hx - b.hx
    const flippedSorted = [...flipped].sort(byHx)
    const baseSorted = [...base].sort(byHx)
    for (let i = 0; i < flippedSorted.length; i++) {
      expect(flippedSorted[i].cz).toBeCloseTo(-baseSorted[i].cz, 6)
      expect(flippedSorted[i].cx).toBeCloseTo(baseSorted[i].cx, 6)
    }
  })

  it('a double mirror (flip twice) is the identity — footprint returns to the original', () => {
    const original = lsofa()
    const twice = mirrorItemX(mirrorItemX(original, 0), 0)
    expect(twice.flipX).toBe(original.flipX ?? false)
    const originalParts = itemFootprintParts(original, Ldef)
    const twiceParts = itemFootprintParts(twice, Ldef)
    const byHx = (a: { hx: number }, b: { hx: number }) => a.hx - b.hx
    const o = [...originalParts].sort(byHx)
    const t = [...twiceParts].sort(byHx)
    for (let i = 0; i < o.length; i++) {
      expect(t[i].cx).toBeCloseTo(o[i].cx, 6)
      expect(t[i].cz).toBeCloseTo(o[i].cz, 6)
    }
  })

  it('flipping the corner base cabinet mirrors its L the same way', () => {
    const cornerAt = (flipX: boolean): FurnitureItem => ({
      id: 'cc',
      defId: 'cabinet-corner',
      position: [0, 0],
      rotation: 0,
      props: {},
      flipX,
    })
    const CornerDef = BUILTIN_CATALOG['cabinet-corner']
    // Un-flipped: run B (index 1 — the left leg) sits on the LEFT (negative cx).
    const base = itemFootprintParts(cornerAt(false), CornerDef)
    expect(base[1].cx).toBeLessThan(0)
    // Flipped: the same run now sits on the RIGHT (positive cx), mirroring the visual.
    const flipped = itemFootprintParts(cornerAt(true), CornerDef)
    expect(flipped[1].cx).toBeGreaterThan(0)
  })

  it('a symmetric (round) footprint is unaffected by flip', () => {
    const table: FurnitureItem = {
      id: 't1',
      defId: 'dining-table-4',
      position: [0, 0],
      rotation: 0,
      props: { shape: 'round', width: 1.2, depth: 1.2 },
    }
    const def = BUILTIN_CATALOG['dining-table-4']
    const base = itemFootprintParts(table, def)
    const flipped = itemFootprintParts({ ...table, flipX: true, flipZ: true }, def)
    expect(flipped.length).toBe(base.length)
    const sumHx = (arr: { hx: number }[]) => arr.reduce((a, p) => a + p.hx, 0)
    expect(sumHx(flipped)).toBeCloseTo(sumHx(base), 6)
  })
})
