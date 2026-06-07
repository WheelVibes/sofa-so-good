import { describe, expect, it } from 'vitest'
import type { FurnitureDef, FurnitureItem } from '../furniture/types'
import { diffVersionFinishes, diffVersionItems } from './versionDiff'

const item = (id: string, defId: string): FurnitureItem => ({
  id,
  defId,
  position: [0, 0],
  rotation: 0,
  props: {},
})
const catalog = {
  chair: { id: 'chair', name: 'Dining chair' },
  sofa: { id: 'sofa', name: 'Sofa' },
} as unknown as Record<string, FurnitureDef>

describe('diffVersionItems', () => {
  it('reports gained / lost types by defId multiset', () => {
    const current = [item('a', 'chair'), item('b', 'sofa')]
    const version = [item('c', 'chair'), item('d', 'chair'), item('e', 'chair')]
    const d = diffVersionItems(current, version, catalog)
    // version has 3 chairs (current 1) → +2 chairs; current has a sofa version lacks → lost 1 sofa
    expect(d.gained).toEqual([{ defId: 'chair', name: 'Dining chair', count: 2 }])
    expect(d.lost).toEqual([{ defId: 'sofa', name: 'Sofa', count: 1 }])
    expect(d.countDelta).toBe(1) // 3 − 2
  })

  it('is empty for identical multisets', () => {
    const a = [item('1', 'chair'), item('2', 'sofa')]
    const b = [item('9', 'sofa'), item('8', 'chair')]
    const d = diffVersionItems(a, b, catalog)
    expect(d.gained).toEqual([])
    expect(d.lost).toEqual([])
    expect(d.countDelta).toBe(0)
  })

  it('falls back to defId when the catalog lacks a name', () => {
    const d = diffVersionItems([], [item('x', 'unknown-def')], catalog)
    expect(d.gained).toEqual([{ defId: 'unknown-def', name: 'unknown-def', count: 1 }])
  })
})

describe('diffVersionFinishes', () => {
  it('reports changed + added + removed floor/wall finishes (from=current, to=version)', () => {
    const current = { floor: { kitchen: 'oak', bath: 'tile' }, walls: { kitchen: 'white' } }
    const version = { floor: { kitchen: 'marble', living: 'oak' }, walls: { kitchen: 'white' } }
    const d = diffVersionFinishes(current, version)
    expect(d).toContainEqual({ roomId: 'kitchen', surface: 'Floor', from: 'oak', to: 'marble' })
    expect(d).toContainEqual({ roomId: 'bath', surface: 'Floor', from: 'tile', to: undefined })
    expect(d).toContainEqual({ roomId: 'living', surface: 'Floor', from: undefined, to: 'oak' })
    // Walls unchanged for kitchen → not reported.
    expect(d.some((c) => c.surface === 'Walls')).toBe(false)
  })

  it('is empty when finishes match (and tolerates undefined inputs)', () => {
    const f = { floor: { a: 'oak' }, walls: { a: 'white' } }
    expect(diffVersionFinishes(f, f)).toEqual([])
    expect(diffVersionFinishes(undefined, undefined)).toEqual([])
  })
})
