import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { cloneRoomItems } from './cloneRoom'

const it_ = (id: string, x: number, z: number, groupId?: string): FurnitureItem => ({
  id,
  defId: 'sofa-3seat',
  position: [x, z],
  rotation: 0,
  props: {},
  groupId,
})

let n = 0
const makeId = () => `new-${n++}`

describe('cloneRoomItems', () => {
  it('translates each item and assigns fresh ids', () => {
    n = 0
    const out = cloneRoomItems([it_('a', 1, 1), it_('b', 2, 3)], 5, -1, makeId)
    expect(out.map((o) => o.id)).toEqual(['new-0', 'new-1'])
    expect(out[0].position).toEqual([6, 0])
    expect(out[1].position).toEqual([7, 2])
  })

  it('remaps shared groups consistently to one new group id', () => {
    n = 0
    const out = cloneRoomItems(
      [it_('a', 0, 0, 'g1'), it_('b', 1, 0, 'g1'), it_('c', 2, 0)],
      0,
      0,
      makeId,
    )
    // a + b shared g1 → same new group; c ungrouped stays undefined.
    expect(out[0].groupId).toBe(out[1].groupId)
    expect(out[0].groupId).not.toBe('g1')
    expect(out[2].groupId).toBeUndefined()
  })
})
