import { describe, expect, it } from 'vitest'
import { computeDimmedItemIds } from './isolateSelection'

describe('computeDimmedItemIds (FEAT-C)', () => {
  it('returns everything except the selection when isolate is active', () => {
    const dimmed = computeDimmedItemIds(['a', 'b', 'c'], ['b'], true)
    expect(dimmed).toEqual(new Set(['a', 'c']))
  })

  it('dims nothing when isolate is off, regardless of selection', () => {
    const dimmed = computeDimmedItemIds(['a', 'b', 'c'], ['b'], false)
    expect(dimmed.size).toBe(0)
  })

  it('dims nothing when nothing is selected, even if isolate is (somehow) active', () => {
    const dimmed = computeDimmedItemIds(['a', 'b', 'c'], [], true)
    expect(dimmed.size).toBe(0)
  })

  it('excludes every selected id from the dimmed set for a multi-selection', () => {
    const dimmed = computeDimmedItemIds(['a', 'b', 'c', 'd'], ['b', 'd'], true)
    expect(dimmed).toEqual(new Set(['a', 'c']))
  })

  it('is empty when the selection covers every item', () => {
    const dimmed = computeDimmedItemIds(['a', 'b'], ['a', 'b'], true)
    expect(dimmed.size).toBe(0)
  })

  it('ignores a selected id that is not among the known item ids', () => {
    const dimmed = computeDimmedItemIds(['a', 'b'], ['zzz'], true)
    expect(dimmed).toEqual(new Set(['a', 'b']))
  })
})
