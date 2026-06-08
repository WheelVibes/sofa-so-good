import { describe, expect, it } from 'vitest'
import {
  type AssetEditSpec,
  addPart,
  createEmptySpec,
  isBuildable,
  partsBounds,
  removePart,
  updatePart,
} from './editSpec'

describe('AssetEditSpec', () => {
  it('starts empty and not buildable', () => {
    const s = createEmptySpec()
    expect(s.parts).toEqual([])
    expect(s.sourceScale).toBe(1)
    expect(isBuildable(s)).toBe(false)
  })

  it('a source GLB or any part makes it buildable', () => {
    expect(isBuildable({ ...createEmptySpec(), sourceAssetId: 'a1' })).toBe(true)
    expect(isBuildable(addPart(createEmptySpec(), 'box'))).toBe(true)
  })

  it('adds, updates and removes parts immutably', () => {
    const s0 = createEmptySpec()
    const s1 = addPart(s0, 'cylinder')
    expect(s0.parts).toHaveLength(0) // original untouched
    expect(s1.parts).toHaveLength(1)
    const id = s1.parts[0].id
    const s2 = updatePart(s1, id, { color: '#ff0000' })
    expect(s2.parts[0].color).toBe('#ff0000')
    expect(s2.parts[0].id).toBe(id) // id preserved
    const s3 = removePart(s2, id)
    expect(s3.parts).toHaveLength(0)
  })

  it('computes a footprint that wraps every part', () => {
    const spec: AssetEditSpec = {
      sourceScale: 1,
      parts: [
        { id: 'a', kind: 'box', position: [0, 0.2, 0], size: [0.4, 0.4, 0.4], color: '#fff' },
        { id: 'b', kind: 'box', position: [1, 0.5, 0], size: [0.4, 1.0, 0.4], color: '#fff' },
      ],
    }
    // x spans -0.2 … 1.2 = 1.4; z spans ±0.2 = 0.4; max height = 0.5+0.5 = 1.0
    expect(partsBounds(spec.parts)).toEqual({ w: 1.4, d: 0.4, h: 1.0 })
  })

  it('returns null bounds when there are no parts', () => {
    expect(partsBounds([])).toBeNull()
  })
})
