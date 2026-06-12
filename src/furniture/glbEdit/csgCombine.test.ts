import { BoxGeometry, BufferGeometry, Float32BufferAttribute, PlaneGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildMaterial } from '../../materials/cache'
import { furnitureMaterialCacheId } from '../../materials/furnitureMaterials'
import type { SolidMaterialDef } from '../../materials/types'
import { partGeometry, partMaterials } from './buildObject'
import {
  bakedPartGeometry,
  canCombineParts,
  combineParts,
  meshPartFromGeometry,
  partTransformMatrix,
  replaceWithCombined,
} from './csgCombine'
import {
  type AssetEditSpec,
  createEmptySpec,
  type GroupMaterialData,
  type ShapePart,
} from './editSpec'

function buildFinishIntoCache(id: string, swatch = '#8a5a2b'): void {
  const def: SolidMaterialDef = {
    id: furnitureMaterialCacheId(id),
    name: 'Test finish',
    category: 'floor',
    swatch,
    kind: 'solid',
  }
  buildMaterial(def)
}

function box(
  id: string,
  position: [number, number, number],
  size: [number, number, number] = [1, 1, 1],
  extra: Partial<ShapePart> = {},
): ShapePart {
  return { id, kind: 'box', position, size, color: '#112233', ...extra }
}

function specWith(...parts: ShapePart[]): AssetEditSpec {
  return { ...createEmptySpec(), parts }
}

describe('canCombineParts', () => {
  const spec = specWith(box('a', [0, 0, 0]), box('b', [0.5, 0, 0]))

  it('accepts two distinct existing parts', () => {
    expect(canCombineParts(spec, 'a', 'b')).toBe(true)
  })

  it('rejects the same part twice', () => {
    expect(canCombineParts(spec, 'a', 'a')).toBe(false)
  })

  it('rejects an unknown id on either side', () => {
    expect(canCombineParts(spec, 'a', 'ghost')).toBe(false)
    expect(canCombineParts(spec, 'ghost', 'b')).toBe(false)
  })
})

describe('partTransformMatrix / bakedPartGeometry', () => {
  it('bakes the position into the geometry (bbox moves to the part centre)', () => {
    const geo = bakedPartGeometry(box('a', [2, 0.5, -1], [1, 1, 1]))
    geo.computeBoundingBox()
    const c = geo.boundingBox!.getCenter(new Vector3())
    expect(c.x).toBeCloseTo(2, 5)
    expect(c.y).toBeCloseTo(0.5, 5)
    expect(c.z).toBeCloseTo(-1, 5)
    geo.dispose()
  })

  it('bakes a degree rotation (90° about Y swaps a box W/D extents)', () => {
    const geo = bakedPartGeometry(box('a', [0, 0, 0], [2, 1, 0.5], { rotation: [0, 90, 0] }))
    geo.computeBoundingBox()
    const s = geo.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(0.5, 5)
    expect(s.y).toBeCloseTo(1, 5)
    expect(s.z).toBeCloseTo(2, 5)
    geo.dispose()
  })

  it('is identity for an untransformed part', () => {
    const m = partTransformMatrix(box('a', [0, 0, 0]))
    expect(m.equals(partTransformMatrix(box('b', [0, 0, 0])))).toBe(true)
    expect(m.elements).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  })
})

describe('meshPartFromGeometry', () => {
  it('carries the first part’s texture finish (GE3c) onto the combined part', () => {
    const geo = new BoxGeometry(0.4, 0.6, 0.8)
    const part = meshPartFromGeometry(
      geo,
      box('a', [0, 0, 0], [1, 1, 1], { finish: 'mat:floor-wood-oak' }),
    )
    expect(part.finish).toBe('mat:floor-wood-oak')
    geo.dispose()
  })

  it('leaves the combined part finish-less when the first part had none', () => {
    const geo = new BoxGeometry(0.4, 0.6, 0.8)
    const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]))
    expect(part.finish).toBeUndefined()
    geo.dispose()
  })

  it('centres the triangles and places the part at the old bounds centre', () => {
    const geo = new BoxGeometry(0.4, 0.6, 0.8)
    geo.translate(1, 2, 3)
    const src = box('a', [0, 0, 0], [1, 1, 1], { roughness: 0.2, metalness: 0.9, opacity: 0.5 })
    const part = meshPartFromGeometry(geo, src)
    expect(part.kind).toBe('mesh')
    expect(part.position[0]).toBeCloseTo(1, 5)
    expect(part.position[1]).toBeCloseTo(2, 5)
    expect(part.position[2]).toBeCloseTo(3, 5)
    expect(part.size[0]).toBeCloseTo(0.4, 5)
    expect(part.size[1]).toBeCloseTo(0.6, 5)
    expect(part.size[2]).toBeCloseTo(0.8, 5)
    expect(part.rotation).toBeUndefined()
    // Carries the first part's material verbatim.
    expect(part.color).toBe('#112233')
    expect(part.roughness).toBe(0.2)
    expect(part.metalness).toBe(0.9)
    expect(part.opacity).toBe(0.5)
    // Stored triangles are re-centred on the part origin.
    geo.computeBoundingBox()
    const c = geo.boundingBox!.getCenter(new Vector3())
    expect(c.length()).toBeCloseTo(0, 5)
    expect(part.geometry!.positions.length).toBeGreaterThan(0)
    expect(part.geometry!.normals.length).toBe(part.geometry!.positions.length)
    geo.dispose()
  })

  it('round-trips through partGeometry (mesh kind rebuilds the same bounds)', () => {
    const geo = new BoxGeometry(0.4, 0.6, 0.8)
    const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]))
    const rebuilt = partGeometry(part)
    rebuilt.computeBoundingBox()
    const s = rebuilt.boundingBox!.getSize(new Vector3())
    expect(s.x).toBeCloseTo(0.4, 5)
    expect(s.y).toBeCloseTo(0.6, 5)
    expect(s.z).toBeCloseTo(0.8, 5)
    geo.dispose()
    rebuilt.dispose()
  })

  it('throws on an empty geometry', () => {
    expect(() => meshPartFromGeometry(new BufferGeometry(), box('a', [0, 0, 0]))).toThrow()
  })

  it('throws on a zero-volume (sliver) result', () => {
    expect(() => meshPartFromGeometry(new PlaneGeometry(1, 1), box('a', [0, 0, 0]))).toThrow()
  })

  // GE3c tail — per-group material preservation
  describe('with groupMaterials (GE3c tail)', () => {
    function geoWithGroups(): BufferGeometry {
      // Build a non-degenerate box geometry without existing groups, then split
      // into 2 groups manually. Using non-indexed geometry (each triangle = 3 verts).
      // 4 triangles × 2 groups = 8 triangles total = 24 verts.
      const N = 24 // verts
      const pos = new Float32Array(N * 3)
      const nor = new Float32Array(N * 3)
      // Fill with simple non-degenerate positions spanning a real bbox
      for (let i = 0; i < N; i++) {
        const side = i < 12 ? 0 : 1
        pos[i * 3] = (i % 4) * 0.1 + side * 0.5
        pos[i * 3 + 1] = ((i % 3) + 1) * 0.1
        pos[i * 3 + 2] = (i % 5) * 0.08
        nor[i * 3] = 0
        nor[i * 3 + 1] = 1
        nor[i * 3 + 2] = 0
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
      geo.setAttribute('normal', new Float32BufferAttribute(nor, 3))
      // No index = non-indexed geometry; groups cover triangle vertex ranges.
      geo.addGroup(0, 36, 0) // first 12 triangles (36 verts) → material 0
      geo.addGroup(36, 36, 1) // next 12 triangles → material 1
      return geo
    }

    const gmA: GroupMaterialData = { color: '#aabbcc', finish: 'mat:floor-wood-oak' }
    const gmB: GroupMaterialData = { color: '#ff0000', roughness: 0.1 }

    it('stores geometry.groups when groupMaterials are provided', () => {
      const geo = geoWithGroups()
      const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]), [gmA, gmB])
      expect(part.geometry!.groups).toHaveLength(2)
      expect(part.geometry!.groups![0].materialIndex).toBe(0)
      expect(part.geometry!.groups![1].materialIndex).toBe(1)
      geo.dispose()
    })

    it('stores geometry.materials index-matched to groups', () => {
      const geo = geoWithGroups()
      const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]), [gmA, gmB])
      expect(part.geometry!.materials).toHaveLength(2)
      expect(part.geometry!.materials![0].finish).toBe('mat:floor-wood-oak')
      expect(part.geometry!.materials![0].color).toBe('#aabbcc')
      expect(part.geometry!.materials![1].color).toBe('#ff0000')
      expect(part.geometry!.materials![1].roughness).toBe(0.1)
      geo.dispose()
    })

    it('omits part-level finish/roughness/metalness when groups are stored', () => {
      const geo = geoWithGroups()
      const part = meshPartFromGeometry(
        geo,
        box('a', [0, 0, 0], [1, 1, 1], { finish: 'mat:fallback', roughness: 0.9 }),
        [gmA, gmB],
      )
      // Part-level finish/roughness should be undefined (group data wins)
      expect(part.finish).toBeUndefined()
      expect(part.roughness).toBeUndefined()
      // But color is still kept for fallback display
      expect(part.color).toBe('#112233')
      geo.dispose()
    })

    it('round-trips groups through partGeometry — geometry has matching groups', () => {
      const geo = geoWithGroups()
      const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]), [gmA, gmB])
      const rebuilt = partGeometry(part)
      expect(rebuilt.groups).toHaveLength(2)
      expect(rebuilt.groups[0].materialIndex).toBe(0)
      expect(rebuilt.groups[1].materialIndex).toBe(1)
      rebuilt.dispose()
      geo.dispose()
    })

    it('partMaterials returns an array for a mesh part with geometry.materials', () => {
      buildFinishIntoCache('csg-test:oak', '#8a5a2b')
      const geo = geoWithGroups()
      const gmWithFinish: GroupMaterialData = { color: '#8a5a2b', finish: 'mat:csg-test:oak' }
      const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]), [gmWithFinish, gmB])
      const mats = partMaterials(part)
      expect(Array.isArray(mats)).toBe(true)
      expect((mats as unknown[]).length).toBe(2)
      geo.dispose()
    })

    it('boxProjectUvs runs on the whole geometry (groups do not split UV generation)', () => {
      const geo = geoWithGroups()
      const part = meshPartFromGeometry(geo, box('a', [0, 0, 0]), [gmA, gmB])
      const rebuilt = partGeometry(part)
      const uv = rebuilt.getAttribute('uv')
      expect(uv).toBeTruthy()
      expect(uv.count).toBe(rebuilt.getAttribute('position').count)
      rebuilt.dispose()
      geo.dispose()
    })
  })
})

describe('replaceWithCombined', () => {
  it('replaces A in place (keeping list order) and drops B', () => {
    const spec = specWith(box('a', [0, 0, 0]), box('mid', [1, 0, 0]), box('b', [2, 0, 0]))
    const combined = box('new', [0, 0, 0], [1, 1, 1])
    const next = replaceWithCombined(spec, 'a', 'b', combined)
    expect(next.parts.map((p) => p.id)).toEqual(['new', 'mid'])
    expect(spec.parts).toHaveLength(3) // immutability
  })
})

describe('combineParts (CSG wiring, real engine)', () => {
  // Two unit boxes overlapping by 0.5m on X, centred at y=0.5 (floor-resting).
  const overlapping = () =>
    specWith(box('a', [0, 0.5, 0]), box('b', [0.5, 0.5, 0], [1, 1, 1], { color: '#ff0000' }))

  it('union replaces both parts with one mesh part spanning both boxes', async () => {
    const { spec, partId } = await combineParts(overlapping(), 'a', 'b', 'union')
    expect(spec.parts).toHaveLength(1)
    const p = spec.parts[0]
    expect(p.id).toBe(partId)
    expect(p.kind).toBe('mesh')
    expect(p.color).toBe('#112233') // first operand's colour (fallback)
    expect(p.size[0]).toBeCloseTo(1.5, 3)
    expect(p.size[1]).toBeCloseTo(1, 3)
    expect(p.position[0]).toBeCloseTo(0.25, 3) // bounds centre of the union
    expect(p.position[1]).toBeCloseTo(0.5, 3)
  })

  it('union preserves per-part materials in geometry.groups / geometry.materials', async () => {
    const { spec } = await combineParts(overlapping(), 'a', 'b', 'union')
    const p = spec.parts[0]
    // With useGroups=true, the CSG result carries groups for each source part's material.
    expect(p.geometry!.groups).toBeDefined()
    expect(p.geometry!.groups!.length).toBeGreaterThanOrEqual(1)
    expect(p.geometry!.materials).toBeDefined()
    // Part A had color '#112233', part B had '#ff0000' — both should appear.
    const colors = p.geometry!.materials!.map((m) => m.color)
    expect(colors).toContain('#112233')
    expect(colors).toContain('#ff0000')
  })

  it('partMaterials returns a material array for a union with distinct part finishes', async () => {
    const spec = specWith(
      box('a', [0, 0.5, 0], [1, 1, 1], { color: '#112233' }),
      box('b', [0.5, 0.5, 0], [1, 1, 1], { color: '#ff0000' }),
    )
    const { spec: combined } = await combineParts(spec, 'a', 'b', 'union')
    const p = combined.parts[0]
    const mats = partMaterials(p)
    expect(Array.isArray(mats)).toBe(true)
    expect((mats as unknown[]).length).toBeGreaterThanOrEqual(1)
  })

  it('parts sharing the same finish+colour produce one merged group (deduplication)', async () => {
    // Both parts have the same colour → the Evaluator should merge their groups.
    const spec = specWith(
      box('a', [0, 0.5, 0], [1, 1, 1], { color: '#aabbcc' }),
      box('b', [0.5, 0.5, 0], [1, 1, 1], { color: '#aabbcc' }),
    )
    const { spec: combined } = await combineParts(spec, 'a', 'b', 'union')
    const p = combined.parts[0]
    // When both brushes share the same proxy material the Evaluator merges groups.
    if (p.geometry?.groups) {
      // All materialIndex values should point to the same entry (merged).
      const indices = p.geometry.groups.map((g) => g.materialIndex)
      expect(indices.every((i) => i === 0)).toBe(true)
    }
  })

  it('geometry has box-projected UVs after union (tiling finish works)', async () => {
    const { spec } = await combineParts(overlapping(), 'a', 'b', 'union')
    const p = spec.parts[0]
    const geo = partGeometry(p)
    expect(geo.getAttribute('uv')).toBeTruthy()
    expect(geo.getAttribute('uv').count).toBe(geo.getAttribute('position').count)
    geo.dispose()
  })

  it('serialize round-trip: groups + materials survive JSON stringify/parse', async () => {
    const { spec } = await combineParts(overlapping(), 'a', 'b', 'union')
    const serialized = JSON.parse(JSON.stringify(spec))
    const p = serialized.parts[0]
    if (p.geometry?.groups) {
      expect(
        p.geometry.groups.every(
          (g: { materialIndex: number }) => typeof g.materialIndex === 'number',
        ),
      ).toBe(true)
      expect(
        p.geometry.materials.every((m: GroupMaterialData) => typeof m.color === 'string'),
      ).toBe(true)
    }
  })

  it('subtract keeps only the un-carved half of the first box', async () => {
    const { spec } = await combineParts(overlapping(), 'a', 'b', 'subtract')
    const p = spec.parts[0]
    expect(p.size[0]).toBeCloseTo(0.5, 3) // 1m box minus 0.5m overlap
    expect(p.position[0]).toBeCloseTo(-0.25, 3)
  })

  it('intersect keeps only the overlap', async () => {
    const { spec } = await combineParts(overlapping(), 'a', 'b', 'intersect')
    const p = spec.parts[0]
    expect(p.size[0]).toBeCloseTo(0.5, 3)
    expect(p.position[0]).toBeCloseTo(0.25, 3)
  })

  it('rejects when intersecting disjoint shapes (degenerate result)', async () => {
    const spec = specWith(box('a', [0, 0.5, 0]), box('b', [5, 0.5, 0]))
    await expect(combineParts(spec, 'a', 'b', 'intersect')).rejects.toThrow()
  })

  it('rejects unknown / identical ids', async () => {
    await expect(combineParts(overlapping(), 'a', 'a', 'union')).rejects.toThrow()
    await expect(combineParts(overlapping(), 'a', 'ghost', 'union')).rejects.toThrow()
  })
})
