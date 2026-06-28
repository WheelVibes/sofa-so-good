import { describe, expect, it } from 'vitest'
import type { PlanOpening, PlanWall } from '../../floorplan/types'
import { snapToNearestWindow, windowFixtureProps } from './windowSnap'

const wall = (id: string, start: [number, number], end: [number, number]): PlanWall => ({
  id,
  start,
  end,
  thickness: 'external',
})

const win = (id: string, wallId: string, offset: number, width = 1.2): PlanOpening => ({
  id,
  kind: 'window',
  wallId,
  offset,
  width,
  sill: 0.9,
  head: 2.1,
})

describe('snapToNearestWindow', () => {
  it('returns null when there are no window openings', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const openings: PlanOpening[] = [
      { id: 'd1', kind: 'door', wallId: 'w1', offset: 1, width: 0.9, sill: 0, head: 2.1 },
    ]
    expect(snapToNearestWindow(walls, openings, [2, 1])).toBeNull()
  })

  it('returns null when no window opening resolves to a wall', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    expect(snapToNearestWindow(walls, [win('win1', 'missing', 1)], [2, 1])).toBeNull()
  })

  it('snaps to the window centre on the wall line (wall along +X)', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestWindow(walls, [win('win1', 'w1', 1, 1.2)], [1.6, 1])
    expect(r).not.toBeNull()
    // Centre = offset + width/2 = 1 + 0.6 = 1.6 along +X, on the wall line (z=0).
    expect(r?.position[0]).toBeCloseTo(1.6, 6)
    expect(r?.position[1]).toBeCloseTo(0, 6)
    expect(r?.openingId).toBe('win1')
    // Carries the window dims for fixture sizing.
    expect(r?.window).toEqual({ width: 1.2, sill: 0.9, head: 2.1 })
  })

  it('faces +Z (toward the drop point) for a wall along +X dropped on the +Z side', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestWindow(walls, [win('win1', 'w1', 1, 1.2)], [1.6, 1])
    // Local +Z maps to (sin r, cos r); we want it pointing toward +Z (the drop side).
    expect(Math.sin(r!.rotation)).toBeCloseTo(0, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(1, 6)
  })

  it('flips to face the opposite side when dropped on the -Z side', () => {
    const walls = [wall('w1', [0, 0], [4, 0])]
    const r = snapToNearestWindow(walls, [win('win1', 'w1', 1, 1.2)], [1.6, -1])
    expect(Math.sin(r!.rotation)).toBeCloseTo(0, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(-1, 6)
  })

  it('picks the nearest of several windows', () => {
    const walls = [wall('w1', [0, 0], [6, 0])]
    const openings = [win('near', 'w1', 4, 1), win('far', 'w1', 0, 1)]
    const r = snapToNearestWindow(walls, openings, [4.5, 0.5])
    expect(r?.openingId).toBe('near')
  })

  it('handles a wall along +Z (faces the room interior)', () => {
    const walls = [wall('w1', [0, 0], [0, 4])]
    // Window centre at z = 1 + 0.6 = 1.6 on the wall line (x=0); drop on +X side.
    const r = snapToNearestWindow(walls, [win('win1', 'w1', 1, 1.2)], [1, 1.6])
    expect(r?.position[0]).toBeCloseTo(0, 6)
    expect(r?.position[1]).toBeCloseTo(1.6, 6)
    // Facing should point toward +X (the drop side): (sin r, cos r) ≈ (1, 0).
    expect(Math.sin(r!.rotation)).toBeCloseTo(1, 6)
    expect(Math.cos(r!.rotation)).toBeCloseTo(0, 6)
  })
})

describe('windowFixtureProps', () => {
  const winDims = { width: 1.4, sill: 0.9, head: 2.1 }

  it('sizes curtains wider than the glass and floor-to-ceiling', () => {
    const p = windowFixtureProps('curtains', winDims, 2.8)
    // Width = glass + overhang each side; wider than the window.
    expect(p.width as number).toBeGreaterThan(winDims.width)
    expect(p.width).toBeCloseTo(1.4 + 0.36, 6)
    // Floor-to-ceiling drop = ceiling - small gap.
    expect(p.height).toBeCloseTo(2.75, 6)
  })

  it('clamps curtain height to the param range for a tall ceiling', () => {
    const p = windowFixtureProps('curtains', winDims, 4.0)
    expect(p.height).toBe(3.2)
  })

  it('sizes a roller blind slightly wider than the window with a covering drop', () => {
    const p = windowFixtureProps('roller-blind', winDims, 2.8)
    expect(p.width as number).toBeGreaterThan(winDims.width)
    expect(p.width).toBeCloseTo(1.4 + 0.12, 6)
    // Mounts above the head and drops past the sill.
    expect(p.height).toBeCloseTo(2.22, 6)
    expect(p.drop as number).toBeGreaterThan(winDims.head - winDims.sill)
  })

  it('returns no sizing for a non-window-fixture def', () => {
    expect(windowFixtureProps('sofa-3seat', winDims, 2.8)).toEqual({})
  })
})
