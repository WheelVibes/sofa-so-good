import { describe, expect, it } from 'vitest'
import {
  chainDimensions,
  projectToBaseline,
  runningDimensions,
  totalChainLength,
} from './dimensionChain'
import type { PlanVec2 } from './types'

const ORIGIN: PlanVec2 = [0, 0]
const X_DIR: PlanVec2 = [1, 0]

describe('projectToBaseline', () => {
  it('returns the signed distance along the X axis from origin', () => {
    expect(projectToBaseline([3, 0], ORIGIN, X_DIR)).toBeCloseTo(3, 10)
    expect(projectToBaseline([3, 5], ORIGIN, X_DIR)).toBeCloseTo(3, 10) // off-axis ignored
    expect(projectToBaseline([-2, 0], ORIGIN, X_DIR)).toBeCloseTo(-2, 10)
  })

  it('normalizes a non-unit direction', () => {
    // dir of length 2 along +X; a point at x=4 still projects to 4.
    expect(projectToBaseline([4, 0], ORIGIN, [2, 0])).toBeCloseTo(4, 10)
  })

  it('measures relative to the supplied origin', () => {
    expect(projectToBaseline([5, 0], [2, 0], X_DIR)).toBeCloseTo(3, 10)
  })

  it('projects onto a 45° baseline', () => {
    // point (1,1) onto unit dir (1,1)/√2 → distance √2.
    expect(projectToBaseline([1, 1], ORIGIN, [1, 1])).toBeCloseTo(Math.SQRT2, 10)
    // perpendicular component is dropped.
    expect(projectToBaseline([1, -1], ORIGIN, [1, 1])).toBeCloseTo(0, 10)
  })

  it('treats a zero-length direction as [1, 0]', () => {
    expect(projectToBaseline([7, 99], ORIGIN, [0, 0])).toBeCloseTo(7, 10)
  })
})

describe('chainDimensions', () => {
  it('emits consecutive segment lengths for points along X at 0/1/3/6', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1, 0],
      [3, 0],
      [6, 0],
    ]
    const chain = chainDimensions(pts, ORIGIN, X_DIR)
    expect(chain.map((c) => c.length)).toEqual([1, 2, 3])
    expect(chain[0]).toEqual({ from: 0, to: 1, length: 1 })
    expect(chain[1]).toEqual({ from: 1, to: 3, length: 2 })
    expect(chain[2]).toEqual({ from: 3, to: 6, length: 3 })
  })

  it('sorts unordered input before chaining', () => {
    const pts: PlanVec2[] = [
      [6, 0],
      [0, 0],
      [3, 0],
      [1, 0],
    ]
    const chain = chainDimensions(pts, ORIGIN, X_DIR)
    expect(chain.map((c) => c.length)).toEqual([1, 2, 3])
  })

  it('dedupes exact and near-duplicate positions', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1, 0],
      [1, 0], // exact dup
      [1 + 1e-9, 0], // near dup (< 1e-6)
      [3, 0],
    ]
    const chain = chainDimensions(pts, ORIGIN, X_DIR)
    expect(chain.map((c) => c.length)).toEqual([1, 2])
  })

  it('keeps positions farther apart than the dedupe epsilon', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1e-5, 0], // > 1e-6 apart → distinct
    ]
    const chain = chainDimensions(pts, ORIGIN, X_DIR)
    expect(chain).toHaveLength(1)
    expect(chain[0]!.length).toBeCloseTo(1e-5, 12)
  })

  it('returns [] for fewer than 2 distinct positions', () => {
    expect(chainDimensions([], ORIGIN, X_DIR)).toEqual([])
    expect(chainDimensions([[2, 0]], ORIGIN, X_DIR)).toEqual([])
    expect(
      chainDimensions(
        [
          [2, 0],
          [2, 0],
        ],
        ORIGIN,
        X_DIR,
      ),
    ).toEqual([])
  })

  it('chains correctly on a 45° baseline', () => {
    // Points lie along the (1,1) line at parameter 0, 1, 3 (× unit step √2).
    const s = Math.SQRT1_2 // 1/√2
    const pts: PlanVec2[] = [
      [0, 0],
      [s, s],
      [3 * s, 3 * s],
    ]
    const chain = chainDimensions(pts, ORIGIN, [1, 1])
    expect(chain.map((c) => c.length)).toHaveLength(2)
    expect(chain[0]!.length).toBeCloseTo(1, 10)
    expect(chain[1]!.length).toBeCloseTo(2, 10)
  })

  it('orders negative (behind-origin) positions correctly', () => {
    const pts: PlanVec2[] = [
      [-2, 0],
      [4, 0],
      [-5, 0],
      [1, 0],
    ]
    const chain = chainDimensions(pts, ORIGIN, X_DIR)
    expect(chain.map((c) => c.from)).toEqual([-5, -2, 1])
    expect(chain.map((c) => c.to)).toEqual([-2, 1, 4])
    expect(chain.map((c) => c.length)).toEqual([3, 3, 3])
  })
})

describe('runningDimensions', () => {
  it('gives cumulative distances from the first position for 0/1/3/6', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1, 0],
      [3, 0],
      [6, 0],
    ]
    expect(runningDimensions(pts, ORIGIN, X_DIR)).toEqual([0, 1, 3, 6])
  })

  it('always starts at 0 and is ascending, even for negative positions', () => {
    const pts: PlanVec2[] = [
      [-5, 0],
      [-2, 0],
      [4, 0],
    ]
    const running = runningDimensions(pts, ORIGIN, X_DIR)
    expect(running[0]).toBe(0)
    expect(running).toEqual([0, 3, 9])
  })

  it('dedupes before accumulating', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [0, 0],
      [2, 0],
      [2 + 1e-9, 0],
      [5, 0],
    ]
    expect(runningDimensions(pts, ORIGIN, X_DIR)).toEqual([0, 2, 5])
  })

  it('returns [] for fewer than 2 distinct positions', () => {
    expect(runningDimensions([], ORIGIN, X_DIR)).toEqual([])
    expect(runningDimensions([[3, 0]], ORIGIN, X_DIR)).toEqual([])
  })
})

describe('totalChainLength', () => {
  it('is max minus min projected position', () => {
    const pts: PlanVec2[] = [
      [0, 0],
      [1, 0],
      [3, 0],
      [6, 0],
    ]
    expect(totalChainLength(pts, ORIGIN, X_DIR)).toBeCloseTo(6, 10)
  })

  it('spans negative through positive positions', () => {
    const pts: PlanVec2[] = [
      [-5, 0],
      [-2, 0],
      [4, 0],
    ]
    expect(totalChainLength(pts, ORIGIN, X_DIR)).toBeCloseTo(9, 10)
  })

  it('uses the 45° baseline span', () => {
    const s = Math.SQRT1_2
    const pts: PlanVec2[] = [
      [0, 0],
      [s, s],
      [3 * s, 3 * s],
    ]
    expect(totalChainLength(pts, ORIGIN, [1, 1])).toBeCloseTo(3, 10)
  })

  it('returns 0 for fewer than 2 distinct positions', () => {
    expect(totalChainLength([], ORIGIN, X_DIR)).toBe(0)
    expect(totalChainLength([[2, 0]], ORIGIN, X_DIR)).toBe(0)
    expect(
      totalChainLength(
        [
          [2, 0],
          [2, 0],
        ],
        ORIGIN,
        X_DIR,
      ),
    ).toBe(0)
  })
})
