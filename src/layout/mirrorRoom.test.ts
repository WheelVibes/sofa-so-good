import { describe, expect, it } from 'vitest'
import type { FurnitureItem } from '../furniture/types'
import { mirrorItemX, mirrorRoomItems } from './mirrorRoom'

const item = (id: string, x: number, z: number, rotation = 0): FurnitureItem => ({
  id,
  defId: 'sofa-3seat',
  position: [x, z],
  rotation,
  props: {},
})

describe('mirrorItemX', () => {
  it('reflects X about the centre, keeps Z', () => {
    const m = mirrorItemX(item('a', 1, 2), 3)
    expect(m.position).toEqual([5, 2]) // 2*3 - 1
  })

  it('negates the heading and toggles flipX', () => {
    const m = mirrorItemX({ ...item('a', 1, 2, 0.5), flipX: false }, 3)
    expect(m.rotation).toBeCloseTo(-0.5)
    expect(m.flipX).toBe(true)
  })

  it('is its own inverse (mirroring twice restores the original)', () => {
    const a = item('a', 1.25, 2.5, 0.8)
    const back = mirrorItemX(mirrorItemX(a, 3), 3)
    expect(back.position[0]).toBeCloseTo(a.position[0])
    expect(back.rotation).toBeCloseTo(a.rotation)
    expect(!!back.flipX).toBe(!!a.flipX)
  })
})

describe('mirrorRoomItems', () => {
  it('only mirrors in-room, unlocked, valid items', () => {
    const items = [
      item('in', 1, 1),
      { ...item('locked', 1, 2), locked: true },
      item('out', 9, 9),
      item('invalid', 2, 2),
    ]
    const inRoom = new Set(['in', 'locked', 'invalid'])
    const isValid = (m: FurnitureItem) => m.id !== 'invalid'
    const { items: next, mirrored } = mirrorRoomItems(items, inRoom, 3, isValid)
    expect(mirrored).toBe(1)
    expect(next.find((i) => i.id === 'in')!.position[0]).toBe(5) // mirrored
    expect(next.find((i) => i.id === 'locked')!.position[0]).toBe(1) // untouched
    expect(next.find((i) => i.id === 'out')!.position[0]).toBe(9) // not in room
    expect(next.find((i) => i.id === 'invalid')!.position[0]).toBe(2) // reverted
  })
})
