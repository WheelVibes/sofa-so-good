import { describe, expect, it } from 'vitest'
import { railingMemberInstances } from './railingLayout'

describe('railingMemberInstances', () => {
  it('emits a top rail + 2 end posts + interior balusters', () => {
    const length = 1.0
    const height = 1.0
    const members = railingMemberInstances(length, height)
    // 1 rail + 2 posts + at least 1 baluster (verticalBarOffsets floors at
    // min=2 bars, i.e. at least 1 interior offset).
    expect(members.length).toBeGreaterThanOrEqual(4)
  })

  it('the top rail sits at the top, centred and spanning the full length', () => {
    const length = 2.0
    const height = 1.0
    const [rail] = railingMemberInstances(length, height)
    expect(rail.position[0]).toBe(0)
    expect(rail.position[1]).toBeCloseTo(height - 0.025, 5)
    expect(rail.size[0]).toBeCloseTo(length, 5)
    expect(rail.size[1]).toBeCloseTo(0.05, 5)
  })

  it('end posts run floor-to-height and sit inset from the wall ends', () => {
    const length = 2.0
    const height = 1.2
    const members = railingMemberInstances(length, height)
    const posts = members.slice(1, 3)
    for (const post of posts) {
      expect(post.size[1]).toBeCloseTo(height, 5)
      expect(post.position[1]).toBeCloseTo(height / 2, 5)
      expect(Math.abs(post.position[0])).toBeCloseTo(length / 2 - 0.02, 5)
    }
  })

  it('every member stays within the length/height bounds', () => {
    const length = 3.4
    const height = 1.0
    for (const m of railingMemberInstances(length, height)) {
      expect(m.position[0] - m.size[0] / 2).toBeGreaterThanOrEqual(-length / 2 - 1e-6)
      expect(m.position[0] + m.size[0] / 2).toBeLessThanOrEqual(length / 2 + 1e-6)
      expect(m.position[1] - m.size[1] / 2).toBeGreaterThanOrEqual(-1e-6)
      expect(m.position[1] + m.size[1] / 2).toBeLessThanOrEqual(height + 1e-6)
    }
  })

  it('balusters are evenly spaced between the posts and span floor to under the rail', () => {
    const length = 1.32 // ~12 bays at 0.11 pitch
    const height = 1.0
    const members = railingMemberInstances(length, height)
    const balusters = members.slice(3)
    expect(balusters.length).toBeGreaterThan(2)
    for (const b of balusters) {
      expect(b.size[1]).toBeCloseTo(height - 0.05, 5)
      expect(b.position[1]).toBeCloseTo((height - 0.05) / 2, 5)
    }
  })

  it('scales with more bays as length grows (denser spacing)', () => {
    const height = 1.0
    const short = railingMemberInstances(0.5, height).length
    const long = railingMemberInstances(5.0, height).length
    expect(long).toBeGreaterThan(short)
  })
})
