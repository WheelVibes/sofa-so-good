import { BoxGeometry, BufferGeometry, Float32BufferAttribute, PlaneGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { buildMaterial } from '../../materials/cache'
import { furnitureMaterialCacheId } from '../../materials/furnitureMaterials'
import type { SolidMaterialDef } from '../../materials/types'
import { partGeometry, partMaterials } from './buildObject'
import { bakedPartGeometry, meshPartFromGeometry, partTransformMatrix } from './csgCombine'
import type { GroupMaterialData, ShapePart } from './editSpec'

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
