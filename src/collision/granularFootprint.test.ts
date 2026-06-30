import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { obbVsObb } from './obb'
import {
  canPlace,
  findItemOverlaps,
  itemAabbBox,
  itemFootprint,
  itemFootprintParts,
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
