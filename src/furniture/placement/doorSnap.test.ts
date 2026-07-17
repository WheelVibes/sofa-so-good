import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanWall } from '../../floorplan/types'
import { doorFixtureProps, snapToNearestDoor } from './doorSnap'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'external',
})

const door = (id: string, wallId: string, offset: number, width = 0.9): PlanOpening => ({
  id,
  kind: 'door',
  wallId,
  offset,
  width,
  sill: 0,
  head: 2.1,
})

describe('snapToNearestDoor', () => {
  it('returns null when there are no door openings', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const openings: PlanOpening[] = [
      { id: 'win1', kind: 'window', wallId: 'w1', offset: 1, width: 1.2, sill: 0.9, head: 2.1 },
    ]
    expect(snapToNearestDoor(walls, openings, [2, 1])).toBeNull()
  })

  it('returns null when no door resolves to a wall', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    expect(snapToNearestDoor(walls, [door('d1', 'missing', 1)], [2, 1])).toBeNull()
  })

  it('snaps to the door centre on the wall line (wall along +X)', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestDoor(walls, [door('d1', 'w1', 1, 0.9)], [1.45, 1])
    expect(r).not.toBeNull()
    // Centre = offset + width/2 = 1 + 0.45 = 1.45 along +X, on the wall line (z=0).
    expect(r?.position[0]).toBeCloseTo(1.45, 6)
    expect(r?.position[1]).toBeCloseTo(0, 6)
    expect(r?.openingId).toBe('d1')
    expect(r?.door).toEqual({ width: 0.9, sill: 0, head: 2.1 })
  })

  it('faces +Z (toward the drop point) for a wall along +X dropped on the +Z side', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestDoor(walls, [door('d1', 'w1', 1, 0.9)], [1.45, 1])
    expect(Math.sin(r!.rotation)).toBeCloseTo(0, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(1, 6)
  })

  it('flips to face the opposite side when dropped on the -Z side', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestDoor(walls, [door('d1', 'w1', 1, 0.9)], [1.45, -1])
    expect(Math.sin(r!.rotation)).toBeCloseTo(0, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(-1, 6)
  })

  it('picks the nearest of several doors', () => {
    const walls = [wall('w1', [0, 0], [6, 0])]
    const openings = [door('near', 'w1', 4, 0.9), door('far', 'w1', 0, 0.9)]
    const r = snapToNearestDoor(walls, openings, [4.5, 0.5])
    expect(r?.openingId).toBe('near')
  })

  it('handles a wall along +Z (faces the room interior)', () => {
    const walls = [wall('w1', [0, 0], [0, 4])]
    const r = snapToNearestDoor(walls, [door('d1', 'w1', 1, 0.9)], [1, 1.45])
    expect(r?.position[0]).toBeCloseTo(0, 6)
    expect(r?.position[1]).toBeCloseTo(1.45, 6)
    expect(Math.sin(r!.rotation)).toBeCloseTo(1, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(0, 6)
  })
})

describe('doorFixtureProps', () => {
  const doorDims = { width: 0.85, sill: 0, head: 2.1 }

  it('spans a pet gate to the door width', () => {
    const p = doorFixtureProps('pet-gate', doorDims)
    expect(p.width).toBeCloseTo(0.85, 6)
  })

  it('spans a pet-door insert to the door width', () => {
    const p = doorFixtureProps('pet-door-insert', doorDims)
    expect(p.width).toBeCloseTo(0.85, 6)
  })

  it('clamps a very wide opening to the fixture param range', () => {
    const p = doorFixtureProps('pet-gate', { width: 3, sill: 0, head: 2.1 })
    expect(p.width).toBe(1.4)
  })

  it('returns no sizing for a non-door-fixture def', () => {
    expect(doorFixtureProps('sofa-3seat', doorDims)).toEqual({})
  })
})
