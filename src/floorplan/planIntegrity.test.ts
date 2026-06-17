import { describe, expect, it } from 'vitest'
import { findStrayOpenings, findStrayRooms, findStrayWalls, wallsConnected } from './planIntegrity'
import type { PlanOpening, PlanRoom, PlanWall } from './types'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'internal',
})

const room = (id: string, origin: [number, number], width: number, depth: number): PlanRoom => ({
  id,
  name: id,
  origin,
  width,
  depth,
})

describe('wallsConnected', () => {
  it('is true for walls sharing a corner', () => {
    expect(wallsConnected(wall('a', [0, 0], [2, 0]), wall('b', [2, 0], [2, 2]))).toBe(true)
  })
  it('is true for a tee (endpoint on the other wall span)', () => {
    expect(wallsConnected(wall('a', [0, 0], [4, 0]), wall('b', [2, 0], [2, 2]))).toBe(true)
  })
  it('is false for walls that never meet', () => {
    expect(wallsConnected(wall('a', [0, 0], [2, 0]), wall('b', [5, 5], [7, 5]))).toBe(false)
  })
})

describe('findStrayWalls', () => {
  it('flags a wall connected to no other wall', () => {
    const walls = [
      wall('a', [0, 0], [2, 0]),
      wall('b', [2, 0], [2, 2]), // joins a
      wall('lonely', [9, 9], [9, 11]), // floating
    ]
    expect(findStrayWalls(walls)).toEqual(['lonely'])
  })
  it('does not flag the only wall (nothing to connect to yet)', () => {
    expect(findStrayWalls([wall('a', [0, 0], [2, 0])])).toEqual([])
  })
  it('flags nothing for a closed loop', () => {
    const walls = [
      wall('n', [0, 0], [4, 0]),
      wall('e', [4, 0], [4, 4]),
      wall('s', [4, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
    ]
    expect(findStrayWalls(walls)).toEqual([])
  })
})

describe('findStrayRooms', () => {
  it('flags a room that touches no other room', () => {
    const rooms = [
      room('living', [0, 0], 4, 3),
      room('kitchen', [4.1, 0], 3, 3), // adjacent (separated by a thin wall gap)
      room('shed', [40, 40], 2, 2), // far away
    ]
    expect(findStrayRooms(rooms)).toEqual(['shed'])
  })
  it('does not flag a single room', () => {
    expect(findStrayRooms([room('only', [0, 0], 4, 3)])).toEqual([])
  })
})

describe('findStrayOpenings', () => {
  const walls = [wall('w1', [0, 0], [4, 0])]
  it('flags an opening whose host wall is missing', () => {
    const o: PlanOpening = {
      id: 'd',
      kind: 'door',
      wallId: 'gone',
      offset: 1,
      width: 0.9,
      sill: 0,
      head: 2.1,
    }
    expect(findStrayOpenings(walls, [o])).toEqual(['d'])
  })
  it('flags an opening that sits off the wall span', () => {
    const o: PlanOpening = {
      id: 'd',
      kind: 'door',
      wallId: 'w1',
      offset: 9,
      width: 0.9,
      sill: 0,
      head: 2.1,
    }
    expect(findStrayOpenings(walls, [o])).toEqual(['d'])
  })
  it('does not flag an opening on its wall', () => {
    const o: PlanOpening = {
      id: 'd',
      kind: 'door',
      wallId: 'w1',
      offset: 1,
      width: 0.9,
      sill: 0,
      head: 2.1,
    }
    expect(findStrayOpenings(walls, [o])).toEqual([])
  })
})
