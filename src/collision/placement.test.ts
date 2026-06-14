import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog'
import type { BuiltinGltfDef, FurnitureItem } from '../furniture/types'
import { canPlace, findItemOverlaps, findWallClips, itemFootprint } from './placement'
import { buildCollisionWalls } from './wallsFromState'

const sofa = BUILTIN_CATALOG['sofa-3seat']
const bed = BUILTIN_CATALOG['bed-double']

const placedSofa = (cx: number, cz: number, rot = 0): FurnitureItem => ({
  id: 's1',
  defId: 'sofa-3seat',
  position: [cx, cz],
  rotation: rot,
  props: {},
})

const placedBed = (cx: number, cz: number, rot = 0): FurnitureItem => ({
  id: 'b1',
  defId: 'bed-double',
  position: [cx, cz],
  rotation: rot,
  props: {},
})

const ctx = (others: FurnitureItem[] = []) => ({
  others,
  defs: BUILTIN_CATALOG,
  doors: {},
})

describe('placement', () => {
  it('itemFootprint scales a GLB footprint per axis (non-uniform resize)', () => {
    const def: BuiltinGltfDef = {
      id: 'g',
      name: 'G',
      category: 'decor',
      kind: 'gltf',
      source: 'builtin',
      url: '/none.glb',
      license: 'CC0',
      defaultFootprint: { w: 2, d: 1, h: 1 },
    }
    const item: FurnitureItem = {
      id: 'g1',
      defId: 'g',
      position: [0, 0],
      rotation: 0,
      props: { scaleX: 2, scaleZ: 0.5 },
    }
    const fp = itemFootprint(item, def)
    expect(fp.hx * 2).toBeCloseTo(4, 6) // width 2 × scaleX 2
    expect(fp.hz * 2).toBeCloseTo(0.5, 6) // depth 1 × scaleZ 0.5
  })

  it('itemFootprint reflects parametric width/depth overrides', () => {
    const item: FurnitureItem = {
      ...placedSofa(5, 5),
      props: { width: 1.5, depth: 0.85 },
    }
    const obb = itemFootprint(item, sofa)
    expect(obb.hx).toBeCloseTo(0.75)
    expect(obb.hz).toBeCloseTo(0.425)
  })

  it('rejects placement that overlaps a wall', () => {
    // Place a sofa straddling the apartment's external south wall (z=0).
    const item: FurnitureItem = placedSofa(2, 0)
    expect(canPlace(item, sofa, ctx())).toBe(false)
  })

  it('accepts placement well inside a room', () => {
    const r = ROOMS.livingDining
    const item: FurnitureItem = placedSofa(r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2)
    expect(canPlace(item, sofa, ctx())).toBe(true)
  })

  it('rejects two items overlapping', () => {
    const r = ROOMS.livingDining
    const a = placedSofa(r.origin[0] + 1, r.origin[1] + 1)
    const b = placedBed(r.origin[0] + 1.2, r.origin[1] + 1)
    expect(canPlace(b, bed, ctx([a]))).toBe(false)
  })

  it('ignores the item itself when re-checking after a small move', () => {
    const r = ROOMS.livingDining
    const a: FurnitureItem = {
      ...placedSofa(r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2),
      id: 'same',
    }
    const moved: FurnitureItem = { ...a, position: [a.position[0] + 0.01, a.position[1]] }
    expect(canPlace(moved, sofa, ctx([a]))).toBe(true)
  })

  describe('group-mates skip mutual collision (snug stacking)', () => {
    // A stacked mattress sits inside the bed frame's OBB by design, so its
    // footprint + vertical span both overlap the frame. Group-mates must not
    // collide; a different/no group must still be blocked.
    const baseDef: BuiltinGltfDef = {
      id: 'bed-frame-glb',
      name: 'Bed frame',
      category: 'beds',
      kind: 'gltf',
      source: 'builtin',
      url: '/assets/test/bed-frame.glb',
      license: 'CC0',
      defaultFootprint: { w: 1, d: 2, h: 1 },
    }
    const topDef: BuiltinGltfDef = {
      id: 'mattress-glb',
      name: 'Mattress',
      category: 'beds',
      kind: 'gltf',
      source: 'builtin',
      url: '/assets/test/mattress.glb',
      license: 'CC0',
      defaultFootprint: { w: 1, d: 2, h: 0.25 },
    }

    // Place the top piece centred on the base, raised onto its surface
    // (span 0.13..0.38) so it overlaps the base frame in both footprint
    // and vertical span — the case that would falsely block placement.
    const base: FurnitureItem = {
      id: 'base',
      defId: baseDef.id,
      position: [0, 0],
      rotation: 0,
      groupId: 'g1',
      props: {},
    }
    const grouped: FurnitureItem = {
      id: 'top',
      defId: topDef.id,
      position: [0, 0],
      rotation: 0,
      groupId: 'g1',
      props: { surfaceHeight: 0.13 },
    }
    const ungrouped: FurnitureItem = { ...grouped, groupId: undefined }

    const stackCtx = {
      others: [base],
      defs: { [baseDef.id]: baseDef, [topDef.id]: topDef },
      doors: {},
      walls: [], // no wall collision in this test
    }

    it('allows a group-mate to overlap (mutual collision skipped)', () => {
      expect(canPlace(grouped, topDef, stackCtx)).toBe(true)
    })

    it('still blocks an overlapping item with no shared group', () => {
      expect(canPlace(ungrouped, topDef, stackCtx)).toBe(false)
    })
  })

  describe('findItemOverlaps', () => {
    it('reports each colliding pair exactly once', () => {
      const a = placedSofa(5, 5)
      const b = { ...placedBed(5.2, 5), id: 'b1' }
      const pairs = findItemOverlaps([a, b], BUILTIN_CATALOG)
      expect(pairs).toHaveLength(1)
      // Unordered pair — both ids present, reported once.
      expect(new Set([pairs[0]!.a, pairs[0]!.b])).toEqual(new Set(['s1', 'b1']))
    })

    it('returns nothing when items are well separated', () => {
      const a = placedSofa(2, 2)
      const b = { ...placedBed(6, 6), id: 'b1' }
      expect(findItemOverlaps([a, b], BUILTIN_CATALOG)).toEqual([])
    })

    it('reuses the height-aware + group rules (no false positives on stacks)', () => {
      const baseDef: BuiltinGltfDef = {
        id: 'frame',
        name: 'Frame',
        category: 'beds',
        kind: 'gltf',
        source: 'builtin',
        url: '/assets/test/frame.glb',
        license: 'CC0',
        defaultFootprint: { w: 1, d: 2, h: 1 },
      }
      const topDef: BuiltinGltfDef = {
        ...baseDef,
        id: 'top',
        name: 'Top',
        defaultFootprint: { w: 1, d: 2, h: 0.25 },
      }
      const base: FurnitureItem = {
        id: 'base',
        defId: 'frame',
        position: [0, 0],
        rotation: 0,
        groupId: 'g1',
        props: {},
      }
      const grouped: FurnitureItem = {
        id: 'mattress',
        defId: 'top',
        position: [0, 0],
        rotation: 0,
        groupId: 'g1',
        props: { surfaceHeight: 0.13 },
      }
      const defs = { frame: baseDef, top: topDef }
      // Group-mates sharing footprint + span are NOT flagged.
      expect(findItemOverlaps([base, grouped], defs)).toEqual([])
      // Drop the shared group → it is a genuine overlap again.
      expect(findItemOverlaps([base, { ...grouped, groupId: undefined }], defs)).toHaveLength(1)
    })

    it('scales to a clean design without flagging anything', () => {
      const items = [placedSofa(2, 2), { ...placedBed(7, 7), id: 'b1' }]
      expect(findItemOverlaps(items, BUILTIN_CATALOG)).toEqual([])
    })

    describe('frame-scoped memo (PERF-FOLLOWUPS)', () => {
      const items = () => [placedSofa(5, 5), { ...placedBed(5.2, 5), id: 'b1' }]

      it('repeated same-tick calls with unchanged identities reuse the result', () => {
        const arr = items()
        const r1 = findItemOverlaps(arr, BUILTIN_CATALOG)
        const r2 = findItemOverlaps(arr, BUILTIN_CATALOG)
        expect(r2).toBe(r1) // same array instance = cache hit, zero recompute
      })

      it('invalidates on item-set identity change (new array, same content)', () => {
        const r1 = findItemOverlaps(items(), BUILTIN_CATALOG)
        const r2 = findItemOverlaps(items(), BUILTIN_CATALOG)
        expect(r2).not.toBe(r1)
        expect(r2).toEqual(r1) // identical content, freshly computed
      })

      it('invalidates on defs identity change', () => {
        const arr = items()
        const r1 = findItemOverlaps(arr, BUILTIN_CATALOG)
        const r2 = findItemOverlaps(arr, { ...BUILTIN_CATALOG })
        expect(r2).not.toBe(r1)
        expect(r2).toEqual(r1)
      })

      it('expires after the current task even with unchanged identities', async () => {
        const arr = items()
        const r1 = findItemOverlaps(arr, BUILTIN_CATALOG)
        await Promise.resolve() // flush microtasks — the memo self-invalidates
        const r2 = findItemOverlaps(arr, BUILTIN_CATALOG)
        expect(r2).not.toBe(r1) // recomputed (GLB footprints may have changed)
        expect(r2).toEqual(r1)
      })
    })
  })

  describe('findWallClips', () => {
    const walls = buildCollisionWalls({})

    it('flags an item poking into the external wall body', () => {
      // A sofa straddling the south external wall (z=0) — the same case canPlace rejects.
      const clipping = placedSofa(2, 0)
      expect(canPlace(clipping, sofa, ctx())).toBe(false) // sanity: it does clip
      expect(findWallClips([clipping], BUILTIN_CATALOG, walls)).toEqual(['s1'])
    })

    it('does not flag an item resting fully inside a room', () => {
      const r = ROOMS.livingDining
      const inside = placedSofa(r.origin[0] + r.width / 2, r.origin[1] + r.depth / 2)
      expect(findWallClips([inside], BUILTIN_CATALOG, walls)).toEqual([])
    })

    it('returns nothing when there are no walls to test', () => {
      expect(findWallClips([placedSofa(2, 0)], BUILTIN_CATALOG, [])).toEqual([])
    })
  })
})

describe('multi-storey collision (F13/ML3)', () => {
  it('items on different levels never collide; same level still does', () => {
    const a: FurnitureItem = {
      id: 'a',
      defId: 'bed-double',
      position: [2, 2],
      rotation: 0,
      props: {},
    }
    const b: FurnitureItem = { ...a, id: 'b', levelId: 'lvl-2' }
    // Identical footprints: cross-level → no overlap, same level → overlap.
    expect(findItemOverlaps([a, b], BUILTIN_CATALOG)).toEqual([])
    expect(findItemOverlaps([a, { ...b, levelId: undefined }], BUILTIN_CATALOG)).toHaveLength(1)
    expect(
      canPlace(b, BUILTIN_CATALOG['bed-double'], {
        others: [a],
        defs: BUILTIN_CATALOG,
        doors: {},
        walls: [],
      }),
    ).toBe(true)
  })
})
