import { describe, expect, it } from 'vitest'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { BuiltinGltfDef, FurnitureDef, FurnitureItem } from '../furniture/types'
import { type OBB, obbMtv, obbVsObb } from './obb'
import { nudgeToValid } from './placement'

/** Soft push-apart: obbMtv (SAT separation vector) + nudgeToValid (nearest valid
 *  spot via a canPlace-verified nudge out of the overlap). */

describe('obbMtv', () => {
  const box = (cx: number, cz: number, hx = 0.5, hz = 0.5, rot = 0): OBB => ({
    cx,
    cz,
    hx,
    hz,
    rot,
  })

  it('returns null for separated boxes', () => {
    expect(obbMtv(box(0, 0), box(3, 0))).toBeNull()
  })

  it('separates two overlapping axis-aligned boxes along the shallow axis', () => {
    // Centres 0.6 apart on X, each half-width 0.5 → 0.4 overlap on X, full on Z.
    const m = obbMtv(box(0, 0), box(0.6, 0))
    expect(m).not.toBeNull()
    expect(Math.abs(m!.nx)).toBeCloseTo(1, 6) // push along X
    expect(Math.abs(m!.nz)).toBeCloseTo(0, 6)
    expect(m!.depth).toBeCloseTo(0.4, 6)
  })

  it('pushes A away from B (direction sign)', () => {
    // A is left of B → push A further left (−X).
    const m = obbMtv(box(0, 0), box(0.6, 0))
    expect(m!.nx).toBeLessThan(0)
  })

  it('applying the MTV separates the boxes', () => {
    const a = box(0, 0)
    const b = box(0.6, 0.2)
    const m = obbMtv(a, b)!
    const moved: OBB = {
      ...a,
      cx: a.cx + m.nx * (m.depth + 1e-4),
      cz: a.cz + m.nz * (m.depth + 1e-4),
    }
    expect(obbVsObb(moved, b)).toBe(false)
  })
})

describe('nudgeToValid', () => {
  const probeDef: BuiltinGltfDef = {
    id: 'probe',
    name: 'Probe',
    category: 'decor',
    kind: 'gltf',
    source: 'builtin',
    url: '/none.glb',
    license: 'CC0',
    defaultFootprint: { w: 0.5, d: 0.5, h: 0.5 },
  }
  const defs: Record<string, FurnitureDef> = { ...BUILTIN_CATALOG, probe: probeDef }
  const at = (id: string, cx: number, cz: number): FurnitureItem => ({
    id,
    defId: 'probe',
    position: [cx, cz],
    rotation: 0,
    props: {},
  })
  // No walls so we isolate furniture-vs-furniture push-apart.
  const ctx = (others: FurnitureItem[]) => ({ others, defs, doors: {}, walls: [] })

  it('returns the current position when already valid', () => {
    const item = at('a', 0, 0)
    expect(nudgeToValid(item, probeDef, ctx([at('b', 5, 5)]))).toEqual([0, 0])
  })

  it('nudges an overlapping item out to a valid, non-overlapping spot', () => {
    const other = at('b', 0, 0)
    const item = at('a', 0.15, 0) // overlaps `other` (both 0.5 wide)
    const res = nudgeToValid(item, probeDef, ctx([other]))
    expect(res).not.toBeNull()
    // Landed valid…
    expect(canPlaceProbe(res!, other)).toBe(true)
    // …and it moved along +X (away from the obstacle it was pushed off).
    expect(res![0]).toBeGreaterThan(0.15)
  })

  it('returns null when a valid spot is beyond maxStep', () => {
    // Overlapping by 0.35 m; clearing needs ~0.35 m but maxStep caps at 0.05 m.
    const item = at('a', 0.15, 0)
    expect(nudgeToValid(item, probeDef, ctx([at('b', 0, 0)]), 0.05)).toBeNull()
  })

  // Local helper: is the probe at `pos` clear of `other`?
  function canPlaceProbe(pos: [number, number], other: FurnitureItem): boolean {
    const a: OBB = { cx: pos[0], cz: pos[1], hx: 0.25, hz: 0.25, rot: 0 }
    const b: OBB = { cx: other.position[0], cz: other.position[1], hx: 0.25, hz: 0.25, rot: 0 }
    return !obbVsObb(a, b)
  }
})
