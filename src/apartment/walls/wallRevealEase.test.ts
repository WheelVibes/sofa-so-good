/**
 * WALL-REVEAL-EASE + WALL-FADE-OVERLAY-CROSSFADE + WALL-REVEAL-RUN-SHARED.
 *
 * The user-visible defect these three exist for: between two SLIGHTLY different
 * orbit angles, whole wall segments jumped between opaque and see-through. The
 * opacity CURVE was already continuous (a `smoothstep` of the camera facing) and so was
 * the `transparent` threshold's placement; what was NOT continuous was (a) the temporal
 * ease — a fixed 0.18-per-frame lerp, so which side of the 0.985 threshold a wall
 * landed on depended on how many frames happened to render, which on a phone at a
 * variable frame rate on a demand-mode canvas is arbitrary — and (b) the several
 * `WallDef`s that make up ONE physical wall each computing their own corner spread, so
 * they settled at different opacities (measured 0.147 vs 0.396) and crossed at
 * different angles: the set of faded walls flipped piecemeal.
 */
import { describe, expect, it } from 'vitest'
import {
  easeRevealOpacity,
  REVEAL_SNAP,
  REVEAL_TAU,
  runCornerNeighbors,
  wallRuns,
} from './wallRevealMath'

describe('easeRevealOpacity (WALL-REVEAL-EASE)', () => {
  it('is frame-rate independent: many small steps match one big step', () => {
    const one = easeRevealOpacity(1, 0.05, 0.05)
    let many = 1
    for (let i = 0; i < 15; i++) many = easeRevealOpacity(many, 0.05, 0.05 / 15)
    expect(many).toBeCloseTo(one, 4)
  })

  it('reaches ~63 % of the gap after one time constant', () => {
    // `delta` is clamped to 0.1 s, so probe the shape with a matching short tau.
    const v = easeRevealOpacity(1, 0, 0.05, 0.05)
    expect(v).toBeCloseTo(Math.exp(-1), 3)
  })

  it('is monotonic and never overshoots the target', () => {
    let v = 1
    let prev = v
    for (let i = 0; i < 200; i++) {
      v = easeRevealOpacity(v, 0.05, 1 / 60)
      expect(v).toBeLessThanOrEqual(prev)
      expect(v).toBeGreaterThanOrEqual(0.05)
      prev = v
    }
    expect(v).toBe(0.05)
  })

  it('settles within ~7 time constants', () => {
    let v = 1
    for (let i = 0; i < Math.round((7 * REVEAL_TAU) / (1 / 60)); i++) {
      v = easeRevealOpacity(v, 0.05, 1 / 60)
    }
    expect(v).toBe(0.05)
  })

  it('snaps onto the target inside the snap band instead of parking short', () => {
    expect(easeRevealOpacity(0.996, 1, 1 / 60)).toBe(1)
    expect(easeRevealOpacity(0.1, 0.1 + REVEAL_SNAP / 2, 1 / 60)).toBe(0.1 + REVEAL_SNAP / 2)
  })

  it('clamps a huge delta so a stalled frame eases instead of teleporting', () => {
    expect(easeRevealOpacity(1, 0, 10)).toBeGreaterThan(0)
    expect(easeRevealOpacity(1, 0, 10)).toBe(easeRevealOpacity(1, 0, 0.1))
  })

  it('leaves the value untouched for a non-finite or non-positive delta', () => {
    expect(easeRevealOpacity(0.5, 0, 0)).toBe(0.5)
    expect(easeRevealOpacity(0.5, 0, Number.NaN)).toBe(0.5)
    expect(easeRevealOpacity(0.5, 0, -1)).toBe(0.5)
  })
})

describe('wallRuns / runCornerNeighbors (WALL-REVEAL-RUN-SHARED)', () => {
  // A ┐ plan: three collinear segments along z = 0 (one physical wall split into
  // three, as `wall-ext-E-col1` / `-col2` / `-mid` are), plus two perpendicular
  // walls each touching a DIFFERENT segment of that run.
  const walls = [
    { id: 'a1', start: [0, 0] as const, end: [2, 0] as const },
    { id: 'a2', start: [2, 0] as const, end: [4, 0] as const },
    { id: 'a3', start: [4, 0] as const, end: [6, 0] as const },
    { id: 'p-left', start: [0, 0] as const, end: [0, 3] as const },
    { id: 'p-right', start: [6, 0] as const, end: [6, 3] as const },
    { id: 'far', start: [10, 10] as const, end: [12, 10] as const },
  ]

  it('groups collinear touching segments into one run under a stable key', () => {
    const runs = wallRuns(walls)
    expect(runs.get('a1')).toBe('a1')
    expect(runs.get('a2')).toBe('a1')
    expect(runs.get('a3')).toBe('a1')
  })

  it('does not merge a perpendicular wall that merely shares a corner', () => {
    const runs = wallRuns(walls)
    expect(runs.get('p-left')).toBe('p-left')
    expect(runs.get('p-right')).toBe('p-right')
  })

  it('does not merge a collinear but DISJOINT wall', () => {
    const runs = wallRuns([
      { id: 'a', start: [0, 0] as const, end: [1, 0] as const },
      { id: 'b', start: [5, 0] as const, end: [6, 0] as const },
    ])
    expect(runs.get('b')).not.toBe(runs.get('a'))
  })

  it('merges a run authored in the opposite direction', () => {
    const runs = wallRuns([
      { id: 'a', start: [0, 0] as const, end: [2, 0] as const },
      { id: 'b', start: [4, 0] as const, end: [2, 0] as const },
    ])
    expect(runs.get('b')).toBe(runs.get('a'))
  })

  it('every member of a run sees the SAME corner-neighbour set', () => {
    const n = runCornerNeighbors(walls)
    const a1 = [...(n.get('a1') ?? [])].sort()
    expect([...(n.get('a2') ?? [])].sort()).toEqual(a1)
    expect([...(n.get('a3') ?? [])].sort()).toEqual(a1)
    expect(a1).toEqual(['p-left', 'p-right'])
  })

  it('excludes the run its own members — a run never spreads onto itself', () => {
    const n = runCornerNeighbors(walls)
    for (const id of ['a1', 'a2', 'a3']) {
      expect(n.get(id)).not.toContain('a1')
      expect(n.get(id)).not.toContain('a2')
      expect(n.get(id)).not.toContain('a3')
    }
  })

  it('leaves an isolated wall with no neighbours', () => {
    expect(runCornerNeighbors(walls).get('far')).toEqual([])
  })

  it('covers every wall id', () => {
    const n = runCornerNeighbors(walls)
    for (const w of walls) expect(n.has(w.id)).toBe(true)
  })
})
