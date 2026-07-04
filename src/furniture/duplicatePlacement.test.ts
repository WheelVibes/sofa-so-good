import { describe, expect, it, vi } from 'vitest'

// Isolate the planning logic from real collision geometry.
vi.mock('../collision/placement', () => ({ canPlace: () => true }))

const { planDuplicates, cloneItemsInPlace } = await import('./duplicatePlacement')

import type { FurnitureDef, FurnitureItem } from './types'

const item = (id: string, x: number, z: number): FurnitureItem => ({
  id,
  defId: 'dining-chair',
  position: [x, z],
  rotation: 0,
  props: {},
})
const defs = { 'dining-chair': { id: 'dining-chair' } } as unknown as Record<string, FurnitureDef>
const ctx = { others: [] as FurnitureItem[], defs, doors: {} }
const ids = () => {
  let n = 0
  return () => `copy-${n++}`
}

describe('planDuplicates', () => {
  it('returns one copy per source with fresh ids at the shared offset', () => {
    const sources = [item('a', 1, 1), item('b', 2, 1)]
    const copies = planDuplicates(sources, { ...ctx, others: sources }, ids())
    expect(copies).toHaveLength(2)
    expect(copies.map((c) => c.id)).toEqual(['copy-0', 'copy-1'])
    // shared (+0.4,+0.4) delta preserves the relative arrangement
    expect(copies[0].position).toEqual([1.4, 1.4])
    expect(copies[1].position).toEqual([2.4, 1.4])
  })

  it('applies a shared groupId when provided, else clears it', () => {
    const sources = [item('a', 1, 1)]
    expect(planDuplicates(sources, { ...ctx, others: sources }, ids(), 'G')[0].groupId).toBe('G')
    expect(planDuplicates(sources, { ...ctx, others: sources }, ids())[0].groupId).toBeUndefined()
  })

  it('returns [] for no sources', () => {
    expect(planDuplicates([], ctx, ids())).toEqual([])
  })
})

describe('cloneItemsInPlace (FEAT-B alt-drag duplicate)', () => {
  it('clones each source at the SAME position with a fresh id', () => {
    const sources = [item('a', 1, 2), item('b', 3, 4)]
    const clones = cloneItemsInPlace(sources, ids())
    expect(clones).toHaveLength(2)
    expect(clones.map((c) => c.id)).toEqual(['copy-0', 'copy-1'])
    expect(clones[0].position).toEqual([1, 2])
    expect(clones[1].position).toEqual([3, 4])
  })

  it('copies props by value, not by reference', () => {
    const src = { ...item('a', 0, 0), props: { color: 'red' } }
    const [clone] = cloneItemsInPlace([src], ids())
    expect(clone.props).toEqual({ color: 'red' })
    expect(clone.props).not.toBe(src.props)
  })

  it('applies a shared groupId when provided, else clears it', () => {
    const grouped = { ...item('a', 1, 1), groupId: 'old-group' }
    expect(cloneItemsInPlace([grouped], ids(), 'G')[0].groupId).toBe('G')
    expect(cloneItemsInPlace([grouped], ids())[0].groupId).toBeUndefined()
  })

  it('returns [] for no sources', () => {
    expect(cloneItemsInPlace([], ids())).toEqual([])
  })
})
