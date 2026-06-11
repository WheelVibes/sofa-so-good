import { BoxGeometry, BufferGeometry, PlaneGeometry, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { partGeometry } from './buildObject'
import {
  bakedPartGeometry,
  canCombineParts,
  combineParts,
  meshPartFromGeometry,
  partTransformMatrix,
  replaceWithCombined,
} from './csgCombine'
import { type AssetEditSpec, createEmptySpec, type ShapePart } from './editSpec'

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
    expect(p.color).toBe('#112233') // first operand's material
    expect(p.size[0]).toBeCloseTo(1.5, 3)
    expect(p.size[1]).toBeCloseTo(1, 3)
    expect(p.position[0]).toBeCloseTo(0.25, 3) // bounds centre of the union
    expect(p.position[1]).toBeCloseTo(0.5, 3)
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
