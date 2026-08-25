import { describe, expect, it } from 'vitest'
import type { OBB } from '../../collision/obb'
import type { CollisionWall } from '../../collision/walls'
import { WALK_PLAYER_RADIUS } from './walkCameraSettings'
import { resolveWalkSpawn } from './walkSpawn'

/** A 1.6 × 0.9 m dining table centred on (11, 5.8) — the default flat's, the one
 *  the old walk spawn (11, 6) stood inside. */
const TABLE: OBB = { cx: 11, cz: 5.8, hx: 0.8, hz: 0.45, rot: 0 }

describe('resolveWalkSpawn', () => {
  it('leaves a clear spawn exactly where it was asked for', () => {
    expect(resolveWalkSpawn(11, 7.5, [TABLE], [])).toEqual([11, 7.5])
  })

  it('passes through untouched when there is no furniture at all', () => {
    expect(resolveWalkSpawn(11, 5.8, [], [])).toEqual([11, 5.8])
  })

  it('pushes a spawn inside a table out to the walker radius clear of it', () => {
    const [x, z] = resolveWalkSpawn(11, 6, [TABLE], [])
    // Nearest way out of the footprint is south (0.2 m in, vs 0.8 m sideways).
    expect(x).toBeCloseTo(11, 6)
    expect(z).toBeGreaterThanOrEqual(TABLE.cz + TABLE.hz + WALK_PLAYER_RADIUS - 1e-6)
  })

  it('never pushes the walker through a wall to escape furniture', () => {
    // A piece hard against the south wall: escaping south would tunnel through it.
    const wall: CollisionWall = { ax: 8, az: 6.6, bx: 13, bz: 6.6, thickness: 0.2 }
    const box: OBB = { cx: 11, cz: 6.2, hx: 1.5, hz: 0.35, rot: 0 }
    const [, z] = resolveWalkSpawn(11, 6.3, [box], [wall])
    expect(z).toBeLessThanOrEqual(6.6 - WALK_PLAYER_RADIUS + 1e-6)
  })

  it('honours a custom radius', () => {
    const [, tight] = resolveWalkSpawn(11, 6, [TABLE], [], 0.1)
    const [, wide] = resolveWalkSpawn(11, 6, [TABLE], [], 0.6)
    expect(wide).toBeGreaterThan(tight)
  })
})
