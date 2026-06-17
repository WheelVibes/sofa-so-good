import { describe, expect, it } from 'vitest'
import type { PlanWall } from '../../../floorplan/types'
import { snapToWalls } from './snapToWalls'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})

// An L: a wall along the x-axis (0,0)→(4,0) and one along z (4,0)→(4,3).
const walls = [wall('a', [0, 0], [4, 0]), wall('b', [4, 0], [4, 3])]

describe('snapToWalls', () => {
  it('snaps onto a nearby wall endpoint (corner)', () => {
    expect(snapToWalls([3.85, 0.1], walls)).toEqual([4, 0])
  })

  it('prefers a corner over a span when both are in range', () => {
    // Close to the shared (4,0) corner AND to both spans — the corner wins.
    expect(snapToWalls([3.9, 0.1], walls, { edges: true })).toEqual([4, 0])
  })

  it('does not snap onto a span unless edges are enabled', () => {
    // Mid-span of wall a, away from any endpoint: no vertex in range.
    expect(snapToWalls([2, 0.15], walls)).toEqual([2, 0.15])
  })

  it('tees onto the nearest span mid-wall when edges are enabled', () => {
    expect(snapToWalls([2, 0.15], walls, { edges: true })).toEqual([2, 0])
  })

  it('stays free when dragged clearly past every wall', () => {
    // Well beyond both radii — extension past a wall must not be captured.
    expect(snapToWalls([6, 2], walls, { edges: true })).toEqual([6, 2])
  })

  it('skips the excluded wall so its own endpoints do not capture the cursor', () => {
    // Near a's end (4,0) but a is excluded; b shares that vertex so it still snaps.
    expect(snapToWalls([3.9, 0.05], walls, { excludeWallId: 'a' })).toEqual([4, 0])
    // With both endpoints owners excluded, nothing snaps.
    expect(snapToWalls([0.1, 0.05], walls, { excludeWallId: 'a' })).toEqual([0.1, 0.05])
  })
})
