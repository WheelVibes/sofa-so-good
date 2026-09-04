import { describe, expect, it } from 'vitest'
import { GROUND_LEVEL_ID } from '../floorplan/levels'
import type { FurnitureItem } from '../furniture/types'
import { cloneRoomItems } from './cloneRoom'
import { swapRoomLayouts } from './swapRooms'

/**
 * ROOM-COPY-LEVEL (F13, v0.31.9.5) — copying or swapping a room's arrangement
 * across STOREYS must move the furniture between storeys, not just in plan XZ.
 *
 * Both helpers spread `...it` and touched only `position`, so `levelId` came
 * along unchanged. Plan coordinates are SHARED across storeys (elevation only
 * offsets rendering), so copying a ground-floor bedroom into an upstairs bedroom
 * produced furniture at the upstairs room's XZ and still on the ground floor —
 * i.e. dropped into whatever room sits below. `FinishPicker` offers its targets
 * from `allPlanRooms`, so an upstairs room is genuinely offerable.
 *
 * Surfaced by the `planCollisionWalls` caller audit (v0.31.9.2), which flagged
 * these two sites for using ground-floor walls. The walls were a SYMPTOM: they
 * were consistent with the wrong placement.
 */
const item = (id: string, levelId?: string): FurnitureItem =>
  ({
    id,
    defId: 'x',
    position: [1, 1],
    rotationY: 0,
    ...(levelId ? { levelId } : {}),
  }) as unknown as FurnitureItem

describe('cloneRoomItems', () => {
  const ids = () => {
    let n = 0
    return () => `c${++n}`
  }

  it('moves the copy onto the target storey', () => {
    const out = cloneRoomItems([item('a')], 2, 3, ids(), 'up')
    expect(out[0]?.levelId).toBe('up')
    expect(out[0]?.position).toEqual([3, 4])
  })

  it('CLEARS levelId for a ground-floor target rather than storing "ground"', () => {
    // Absent means ground everywhere else in the codebase; storing the literal
    // would make two representations of the same storey.
    const out = cloneRoomItems([item('a', 'up')], 0, 0, ids(), GROUND_LEVEL_ID)
    expect('levelId' in (out[0] as object)).toBe(false)
  })

  it('leaves levelId alone when no target storey is given (same-storey copy)', () => {
    expect(cloneRoomItems([item('a', 'up')], 1, 1, ids())[0]?.levelId).toBe('up')
    expect(cloneRoomItems([item('a')], 1, 1, ids())[0]?.levelId).toBeUndefined()
  })
})

describe('swapRoomLayouts', () => {
  it('exchanges the two sides STOREYS as well as their positions', () => {
    const out = swapRoomLayouts(
      [item('a'), item('b', 'up'), item('other')],
      new Set(['a']),
      new Set(['b']),
      5,
      0,
      GROUND_LEVEL_ID,
      'up',
    )
    const byId = (id: string) => out.find((i) => i.id === id)
    // A came from ground and lands upstairs.
    expect(byId('a')?.levelId).toBe('up')
    expect(byId('a')?.position).toEqual([6, 1])
    // B came from upstairs and lands on the ground — so its key is cleared.
    expect('levelId' in (byId('b') as object)).toBe(false)
    expect(byId('b')?.position).toEqual([-4, 1])
    // Untouched items keep their identity object.
    expect(byId('other')?.levelId).toBeUndefined()
  })

  it('is unchanged for a same-storey swap, which is the common case', () => {
    const out = swapRoomLayouts([item('a'), item('b')], new Set(['a']), new Set(['b']), 5, 0)
    expect(out.every((i) => i.levelId === undefined)).toBe(true)
    expect(out.find((i) => i.id === 'a')?.position).toEqual([6, 1])
  })
})
