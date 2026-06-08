import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { swapRoomLayouts } from './swapRooms'

const it_ = (id: string, x: number, z: number): FurnitureItem => ({
  id,
  defId: 'sofa-3seat',
  position: [x, z],
  rotation: 0,
  props: {},
})

describe('swapRoomLayouts', () => {
  it('moves A-items by +delta and B-items by -delta, leaving others put', () => {
    const items = [it_('a', 1, 1), it_('b', 11, 1), it_('c', 50, 50)]
    const out = swapRoomLayouts(items, new Set(['a']), new Set(['b']), 10, 0)
    expect(out.find((i) => i.id === 'a')!.position).toEqual([11, 1]) // A→B
    expect(out.find((i) => i.id === 'b')!.position).toEqual([1, 1]) // B→A
    expect(out.find((i) => i.id === 'c')!.position).toEqual([50, 50]) // untouched
  })

  it('with an empty B set, only A-items move (one-directional)', () => {
    const out = swapRoomLayouts([it_('a', 2, 3), it_('c', 50, 50)], new Set(['a']), new Set(), 7, 1)
    expect(out.find((i) => i.id === 'a')!.position).toEqual([9, 4])
    expect(out.find((i) => i.id === 'c')!.position).toEqual([50, 50])
  })

  it('exchanges the two sets so each lands where the other was (centre-delta)', () => {
    // a at A-centre (0,0), b at B-centre (10,0); delta = B−A = (10,0).
    const out = swapRoomLayouts(
      [it_('a', 0, 0), it_('b', 10, 0)],
      new Set(['a']),
      new Set(['b']),
      10,
      0,
    )
    expect(out.find((i) => i.id === 'a')!.position).toEqual([10, 0]) // a → B-centre
    expect(out.find((i) => i.id === 'b')!.position).toEqual([0, 0]) // b → A-centre
  })
})
