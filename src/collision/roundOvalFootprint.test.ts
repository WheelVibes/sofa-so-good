import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { obbVsObb } from './obb'
import { canPlace, itemFootprint, itemFootprintParts } from './placement'

/**
 * Round/oval table footprints (TODO "More composite footprints"): the disc/
 * ellipse is approximated as a small union of inscribed OBBs
 * (`furniture/footprintShapes.ts:ellipseFootprintParts`), wired into
 * `dining-table-4`, `coffee-table`, and `side-table`'s `footprintParts`. This
 * frees the bbox corners a round/oval top never actually occupies, while
 * still blocking the disc's true interior — without regressing rectangular
 * tables (still a single enclosing OBB).
 */

// A tiny (0.02 x 0.02) probe — small enough to land in the thin curved sliver
// between the inscribed-OBB union and the bbox corner without its own
// half-extent (0.01 m) crossing back into a band.
const tinyProbeDef: BuiltinGltfDef = {
  id: 'tiny-probe',
  name: 'Tiny probe',
  category: 'decor',
  kind: 'gltf',
  source: 'builtin',
  url: '/none.glb',
  license: 'CC0',
  defaultFootprint: { w: 0.02, d: 0.02, h: 0.02 },
}

// A bigger (0.4 x 0.4) probe for interior/centre hits, where a generous
// margin makes the exact coordinates non-fiddly.
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

const defs: Record<string, FurnitureDef> = {
  ...BUILTIN_CATALOG,
  'tiny-probe': tinyProbeDef,
  probe: probeDef,
}
const ctx = (others: FurnitureItem[]) => ({ others, defs, doors: {}, walls: [] })

const probeAt = (cx: number, cz: number): FurnitureItem => ({
  id: 'p1',
  defId: 'probe',
  position: [cx, cz],
  rotation: 0,
  props: {},
})
const tinyProbeAt = (cx: number, cz: number): FurnitureItem => ({
  id: 'tp1',
  defId: 'tiny-probe',
  position: [cx, cz],
  rotation: 0,
  props: {},
})

const tableAt = (
  defId: string,
  cx: number,
  cz: number,
  props: FurnitureItem['props'] = {},
  rotation = 0,
): FurnitureItem => ({ id: 't1', defId, position: [cx, cz], rotation, props })

describe('round/oval table footprints — dining-table-4', () => {
  const def = BUILTIN_CATALOG['dining-table-4']!

  it('round: frees a corner the bounding box would block', () => {
    const table = tableAt('dining-table-4', 0, 0, { shape: 'round', width: 1.5, depth: 0.9 })
    // Bbox half-extents are 0.75 x 0.45; the disc's widest band is only
    // 0.693 m half-width, so (0.74, 0.4) is inside the bbox corner but clear
    // of every part.
    const corner = tinyProbeAt(0.74, 0.4)
    expect(canPlace(corner, tinyProbeDef, ctx([table]))).toBe(true)
    // The single enclosing boxes DO overlap — proving the disc union (not
    // mere distance) is what frees the corner.
    expect(obbVsObb(itemFootprint(corner, tinyProbeDef), itemFootprint(table, def))).toBe(true)
  })

  it('round: still blocks the centre', () => {
    const table = tableAt('dining-table-4', 0, 0, { shape: 'round', width: 1.5, depth: 0.9 })
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
    expect(itemFootprintParts(table, def).length).toBeGreaterThan(1)
  })

  it('oval: frees a corner, still blocks the centre', () => {
    const table = tableAt('dining-table-4', 0, 0, { shape: 'oval', width: 1.5, depth: 0.9 })
    expect(canPlace(tinyProbeAt(0.74, 0.4), tinyProbeDef, ctx([table]))).toBe(true)
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
  })

  it('rect: unchanged single-box behaviour (same corner still blocked)', () => {
    const table = tableAt('dining-table-4', 0, 0, { shape: 'rect', width: 1.5, depth: 0.9 })
    expect(itemFootprintParts(table, def)).toHaveLength(1)
    expect(canPlace(tinyProbeAt(0.74, 0.4), tinyProbeDef, ctx([table]))).toBe(false)
  })
})

describe('round/oval table footprints — coffee-table', () => {
  const def = BUILTIN_CATALOG['coffee-table']!

  it('oval: frees a corner, blocks the centre', () => {
    const table = tableAt('coffee-table', 0, 0, { shape: 'oval', width: 1.4, depth: 0.7 })
    // Bbox half-extents 0.7 x 0.35; widest band is 0.647 m half-width.
    expect(canPlace(tinyProbeAt(0.66, 0.3), tinyProbeDef, ctx([table]))).toBe(true)
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
  })

  it('round: frees a corner, blocks the centre', () => {
    const table = tableAt('coffee-table', 0, 0, { shape: 'round', width: 1.0, depth: 0.5 })
    // Round coffee-table half-extents (from the base bbox) are 0.5 x 0.25;
    // widest band is 0.4619 m half-width.
    expect(canPlace(tinyProbeAt(0.48, 0.22), tinyProbeDef, ctx([table]))).toBe(true)
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
  })

  it('rect: unaffected — remains a single full box', () => {
    const table = tableAt('coffee-table', 0, 0, { shape: 'rect', width: 1.1, depth: 0.55 })
    expect(itemFootprintParts(table, def)).toHaveLength(1)
  })
})

describe('round/oval table footprints — side-table', () => {
  const def = BUILTIN_CATALOG['side-table']!

  it('round (3-leg): the diameter x diameter bbox becomes a true circle', () => {
    const table = tableAt('side-table', 0, 0, { shape: 'round', diameter: 0.6 })
    // Corner of the 0.6x0.6 square bbox (±0.3,±0.3): the widest band is only
    // 0.277 m half-width, so (0.29, 0.29) is inside the bbox but outside the disc.
    expect(canPlace(tinyProbeAt(0.29, 0.29), tinyProbeDef, ctx([table]))).toBe(true)
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
  })

  it('drum (cylindrical pedestal): same circular treatment as round', () => {
    const table = tableAt('side-table', 0, 0, { shape: 'drum', diameter: 0.6 })
    expect(canPlace(tinyProbeAt(0.29, 0.29), tinyProbeDef, ctx([table]))).toBe(true)
    expect(canPlace(probeAt(0, 0), probeDef, ctx([table]))).toBe(false)
  })

  it('square: unaffected — remains a single full box', () => {
    const table = tableAt('side-table', 0, 0, { shape: 'square', diameter: 0.6 })
    expect(itemFootprintParts(table, def)).toHaveLength(1)
    expect(canPlace(probeAt(0.26, 0.26), probeDef, ctx([table]))).toBe(false)
  })
})

describe('round/oval table footprints — transforms', () => {
  const def = BUILTIN_CATALOG['dining-table-4']!

  it('rotates with the item — a corner freed at yaw 0 is blocked at the swapped axis after 90°', () => {
    const flat = tableAt('dining-table-4', 0, 0, { shape: 'round', width: 1.5, depth: 0.9 })
    const rotated = tableAt(
      'dining-table-4',
      0,
      0,
      { shape: 'round', width: 1.5, depth: 0.9 },
      Math.PI / 2,
    )
    // At yaw 0 the disc's local +X corner (0.74, 0.4) is free.
    expect(canPlace(tinyProbeAt(0.74, 0.4), tinyProbeDef, ctx([flat]))).toBe(true)
    // After a +90° yaw the local +X axis now points along world -Z, so the
    // *same world point* (0.74, 0.4) is no longer trivially free — but the
    // centre (0,0) stays blocked regardless of rotation (it's the item's own
    // position either way).
    expect(canPlace(probeAt(0, 0), probeDef, ctx([rotated]))).toBe(false)
    expect(itemFootprintParts(rotated, def).length).toBeGreaterThan(1)
  })

  it('scales with the item — parts grow/shrink with props.scale', () => {
    const base = tableAt('coffee-table', 0, 0, { shape: 'round', width: 1.0, depth: 1.0 })
    const scaled = tableAt('coffee-table', 0, 0, {
      shape: 'round',
      width: 1.0,
      depth: 1.0,
      scale: 2,
    })
    const cdef = BUILTIN_CATALOG['coffee-table']!
    const baseParts = itemFootprintParts(base, cdef)
    const scaledParts = itemFootprintParts(scaled, cdef)
    expect(scaledParts).toHaveLength(baseParts.length)
    for (let i = 0; i < baseParts.length; i++) {
      expect(scaledParts[i].hx).toBeCloseTo(baseParts[i].hx * 2, 6)
      expect(scaledParts[i].hz).toBeCloseTo(baseParts[i].hz * 2, 6)
    }
  })

  it('non-uniform scale (scaleX/scaleZ) stretches parts independently — oval-via-scale', () => {
    const cdef = BUILTIN_CATALOG['coffee-table']!
    const base = tableAt('coffee-table', 0, 0, { shape: 'round', width: 1.0, depth: 1.0 })
    const stretched = tableAt('coffee-table', 0, 0, {
      shape: 'round',
      width: 1.0,
      depth: 1.0,
      scaleX: 1.5,
      scaleZ: 0.5,
    })
    const baseParts = itemFootprintParts(base, cdef)
    const stretchedParts = itemFootprintParts(stretched, cdef)
    for (let i = 0; i < baseParts.length; i++) {
      expect(stretchedParts[i].hx).toBeCloseTo(baseParts[i].hx * 1.5, 6)
      expect(stretchedParts[i].hz).toBeCloseTo(baseParts[i].hz * 0.5, 6)
    }
  })

  it('very small round table still produces a valid, bounded part set', () => {
    const sdef = BUILTIN_CATALOG['side-table']!
    const tiny = tableAt('side-table', 0, 0, { shape: 'round', diameter: 0.1 })
    const parts = itemFootprintParts(tiny, sdef)
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) {
      expect(p.hx).toBeGreaterThanOrEqual(0)
      expect(p.hz).toBeGreaterThanOrEqual(0)
      expect(p.hx).toBeLessThanOrEqual(0.05 + 1e-9)
    }
  })

  it('very large round table stays proportionate (no runaway part count/size)', () => {
    const huge = tableAt('dining-table-4', 0, 0, { shape: 'round', width: 20, depth: 12 })
    const parts = itemFootprintParts(huge, def)
    expect(parts).toHaveLength(5)
    for (const p of parts) {
      expect(p.hx).toBeLessThanOrEqual(10 + 1e-9)
      expect(p.hz).toBeLessThanOrEqual(6 + 1e-9)
    }
  })
})
