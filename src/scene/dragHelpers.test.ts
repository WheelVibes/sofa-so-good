import { describe, expect, it } from 'vitest'
import type { CollisionWall } from '../collision/walls'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { FurnitureItem } from '../furniture/types'
import {
  halfExtents,
  isActiveDragPointer,
  pointInFootprint,
  snapAxis,
  snapBase,
  staticAabbs,
  wallFaces,
} from './dragHelpers'

const item = (id: string, defId: string, x: number, z: number, rot = 0): FurnitureItem => ({
  id,
  defId,
  position: [x, z],
  rotation: rot,
  props: {},
})

describe('halfExtents', () => {
  it('returns half the footprint on the axes when unrotated', () => {
    const def = BUILTIN_CATALOG['sofa-3seat']
    const [hx, hz] = halfExtents(item('s', 'sofa-3seat', 0, 0), def)
    expect(hx).toBeCloseTo(def.defaultFootprint.w / 2, 5)
    expect(hz).toBeCloseTo(def.defaultFootprint.d / 2, 5)
  })
  it('swaps the extents at a quarter turn', () => {
    const def = BUILTIN_CATALOG['sofa-3seat']
    const [hx, hz] = halfExtents(item('s', 'sofa-3seat', 0, 0, Math.PI / 2), def)
    expect(hx).toBeCloseTo(def.defaultFootprint.d / 2, 5)
    expect(hz).toBeCloseTo(def.defaultFootprint.w / 2, 5)
  })
  it('reads parametric width/depth overrides from props', () => {
    const def = BUILTIN_CATALOG['sofa-3seat']
    const it: FurnitureItem = { ...item('s', 'sofa-3seat', 0, 0), props: { width: 2, depth: 1 } }
    const [hx, hz] = halfExtents(it, def)
    expect(hx).toBeCloseTo(1, 5)
    expect(hz).toBeCloseTo(0.5, 5)
  })
})

describe('snapAxis', () => {
  it('snaps a centre to a nearby other centre within threshold', () => {
    const r = snapAxis(2.05, 0.5, [{ c: 2.0, h: 0.5 }])
    expect(r?.center).toBeCloseTo(2.0, 5)
    expect(r?.guide).toBeCloseTo(2.0, 5)
  })
  it('returns null when nothing is within the threshold', () => {
    expect(snapAxis(5, 0.5, [{ c: 2.0, h: 0.5 }])).toBeNull()
  })
  it('snaps far edges aligned', () => {
    // dragged far edge (center+dh) close to other's far edge (c+h)
    const r = snapAxis(1.02, 0.5, [{ c: 1.0, h: 0.5 }])
    expect(r).not.toBeNull()
  })
})

describe('pointInFootprint', () => {
  const def = BUILTIN_CATALOG['coffee-table']
  it('is true at the item centre', () => {
    expect(pointInFootprint(3, 3, item('t', 'coffee-table', 3, 3), def)).toBe(true)
  })
  it('is false well outside the footprint', () => {
    expect(pointInFootprint(30, 30, item('t', 'coffee-table', 3, 3), def)).toBe(false)
  })
})

describe('wallFaces', () => {
  it('emits 3 faces (centre ± thickness) per axis-aligned wall', () => {
    const vertical: CollisionWall = { ax: 2, az: 0, bx: 2, bz: 4, thickness: 0.1 }
    const faces = wallFaces([vertical])
    expect(faces).toHaveLength(3)
    expect(faces.every((f) => f.orient === 'v')).toBe(true)
    expect(faces.map((f) => f.face).sort()).toEqual([1.95, 2, 2.05])
  })
  it('classifies a horizontal wall', () => {
    const horizontal: CollisionWall = { ax: 0, az: 5, bx: 4, bz: 5, thickness: 0.2 }
    const faces = wallFaces([horizontal])
    expect(faces.every((f) => f.orient === 'h')).toBe(true)
  })
})

describe('staticAabbs', () => {
  const catalog = BUILTIN_CATALOG
  it('excludes moved items and builds AABBs for the rest', () => {
    const items = [item('a', 'coffee-table', 1, 1), item('b', 'sofa-3seat', 5, 5)]
    const { aabbs, staticItems } = staticAabbs(items, new Set(['a']), catalog)
    expect(staticItems.map((i) => i.id)).toEqual(['b'])
    expect(aabbs).toHaveLength(1)
    expect(aabbs[0].id).toBe('b')
    expect(aabbs[0].maxX).toBeGreaterThan(aabbs[0].minX)
  })
  it('skips items whose def is missing from the catalog', () => {
    const items = [item('a', 'coffee-table', 1, 1), item('ghost', 'nonexistent-def', 2, 2)]
    const { staticItems } = staticAabbs(items, new Set(), catalog)
    expect(staticItems.map((i) => i.id)).toEqual(['a'])
  })
})

describe('isActiveDragPointer (BUG-1: multi-touch drag hijack gate)', () => {
  it('accepts the pointer that started the drag', () => {
    expect(isActiveDragPointer(1, 1)).toBe(true)
  })
  it('rejects a second finger with a different pointerId', () => {
    expect(isActiveDragPointer(1, 2)).toBe(false)
  })
  it('is permissive when no pointerId was recorded (defensive, should not occur post-fix)', () => {
    expect(isActiveDragPointer(null, 7)).toBe(true)
  })
  it('accepts pointerId 0 (a valid id, not falsy-nullish)', () => {
    expect(isActiveDragPointer(0, 0)).toBe(true)
    expect(isActiveDragPointer(0, 1)).toBe(false)
  })
})

describe('snapBase', () => {
  it('returns null for non-IKEA defs (snug-stack is IKEA-only)', () => {
    const def = BUILTIN_CATALOG['coffee-table']
    expect(snapBase(def, item('h', 'sofa-3seat', 0, 0), BUILTIN_CATALOG['sofa-3seat'])).toBeNull()
  })
  it('returns null when any def is missing', () => {
    expect(snapBase(undefined, item('h', 'sofa-3seat', 0, 0), undefined)).toBeNull()
  })
})
