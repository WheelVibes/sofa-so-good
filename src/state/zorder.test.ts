import { describe, expect, it } from 'vitest'
import { reorderByIds } from './zorder'

const ids = (items: { id: string }[]) => items.map((i) => i.id).join('')
const list = (s: string) => [...s].map((id) => ({ id }))

describe('reorderByIds', () => {
  it('brings a single item to the front (end)', () => {
    expect(ids(reorderByIds(list('ABCD'), ['B'], 'front'))).toBe('ACDB')
  })
  it('sends a single item to the back (start)', () => {
    expect(ids(reorderByIds(list('ABCD'), ['C'], 'back'))).toBe('CABD')
  })
  it('moves a single item one step forward', () => {
    expect(ids(reorderByIds(list('ABCD'), ['B'], 'forward'))).toBe('ACBD')
  })
  it('moves a single item one step backward', () => {
    expect(ids(reorderByIds(list('ABCD'), ['C'], 'backward'))).toBe('ACBD')
  })
  it('moves a multi-selection forward as one block, preserving order', () => {
    expect(ids(reorderByIds(list('ABCD'), ['B', 'C'], 'forward'))).toBe('ADBC')
  })
  it('moves a multi-selection backward as one block', () => {
    expect(ids(reorderByIds(list('ABCD'), ['B', 'C'], 'backward'))).toBe('BCAD')
  })
  it('keeps an already-front item put when moving forward', () => {
    expect(ids(reorderByIds(list('ABCD'), ['D'], 'forward'))).toBe('ABCD')
  })
  it('brings a multi-selection to front preserving relative order', () => {
    expect(ids(reorderByIds(list('ABCD'), ['A', 'C'], 'front'))).toBe('BDAC')
  })
  it('does not mutate the input', () => {
    const src = list('ABC')
    reorderByIds(src, ['A'], 'front')
    expect(ids(src)).toBe('ABC')
  })
  it('is a no-op for an empty or cover-all selection', () => {
    expect(ids(reorderByIds(list('ABC'), [], 'front'))).toBe('ABC')
    expect(ids(reorderByIds(list('ABC'), ['A', 'B', 'C'], 'back'))).toBe('ABC')
  })
})
