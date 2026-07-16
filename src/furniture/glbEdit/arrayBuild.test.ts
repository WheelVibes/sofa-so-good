import { describe, expect, it } from 'vitest'
import { linearArray, radialArray } from './arrayBuild'
import { type AssetEditSpec, partGroups, type ShapePart } from './editSpec'

function box(id: string, position: [number, number, number]): ShapePart {
  return { id, kind: 'box', position, size: [0.1, 0.5, 0.1], color: '#888' }
}
function spec(parts: ShapePart[]): AssetEditSpec {
  return { sourceScale: 1, meshOverrides: {}, parts }
}

describe('linearArray', () => {
  it('creates count copies in one named group with equal gaps', () => {
    const s = spec([box('leg', [0, 0.25, 0])])
    const { spec: out, groupId } = linearArray(s, ['leg'], { count: 4, gap: 0.3, axis: 'x' })
    expect(groupId).toBeTruthy()
    const groups = partGroups(out)
    expect(groups).toHaveLength(1)
    expect(groups[0].partIds).toHaveLength(4)
    // Copies at x = 0.3, 0.6, 0.9, 1.2.
    const xs = groups[0].partIds
      .map((id) => out.parts.find((p) => p.id === id)!.position[0])
      .sort((a, b) => a - b)
    for (const [i, x] of [0.3, 0.6, 0.9, 1.2].entries()) expect(xs[i]).toBeCloseTo(x, 6)
    // Equal gaps.
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 6)
  })

  it('no-ops for a degenerate gap', () => {
    const s = spec([box('leg', [0, 0.25, 0])])
    expect(linearArray(s, ['leg'], { count: 4, gap: 0, axis: 'x' }).groupId).toBeNull()
  })
})

describe('radialArray', () => {
  it('rings count copies around the source centroid at the given radius', () => {
    const s = spec([box('leg', [0, 0.25, 0])])
    const { spec: out, groupId } = radialArray(s, ['leg'], { count: 6, radius: 0.5, sweepDeg: 360 })
    expect(groupId).toBeTruthy()
    const g = partGroups(out)[0]
    expect(g.partIds).toHaveLength(6)
    // Every copy sits at radius 0.5 from the centroid (0,0) in XZ.
    for (const id of g.partIds) {
      const p = out.parts.find((x) => x.id === id)!
      const r = Math.hypot(p.position[0], p.position[2])
      expect(r).toBeCloseTo(0.5, 5)
    }
  })

  it('no-ops for count < 2', () => {
    const s = spec([box('leg', [0, 0.25, 0])])
    expect(radialArray(s, ['leg'], { count: 1, radius: 0.5, sweepDeg: 360 }).groupId).toBeNull()
  })
})
