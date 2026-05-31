import { describe, expect, it } from 'vitest'
import { fuzzyScore, fuzzySearch } from './fuzzySearch'

describe('fuzzyScore', () => {
  it('scores an exact/substring match higher than a scattered subsequence', () => {
    expect(fuzzyScore('sofa', 'sofa')).toBeGreaterThan(fuzzyScore('sofa', 'soft armchair fabric'))
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('SOFA', 'Grey Sofa')).toBeGreaterThan(0)
  })

  it('matches an out-of-order subsequence (typo tolerance via skips)', () => {
    // 'chiar' → 'chair' as a subsequence c-h-i-a-r is NOT present, but the
    // single-transposition tolerance should still find it.
    expect(fuzzyScore('chiar', 'dining chair')).toBeGreaterThan(0)
  })

  it('returns 0 when characters are missing entirely', () => {
    expect(fuzzyScore('couch', 'sofa')).toBe(0)
  })

  it('rewards contiguous and word-boundary matches', () => {
    // 'ds' should prefer 'Desk' (word start d…) over a scattered hit.
    expect(fuzzyScore('de', 'Desk')).toBeGreaterThan(fuzzyScore('de', 'wardrobe'))
  })
})

interface Item {
  name: string
  keywords?: string[]
}

describe('fuzzySearch', () => {
  const items: Item[] = [
    { name: '3-seat sofa', keywords: ['couch', 'settee'] },
    { name: 'Dining chair' },
    { name: 'Office chair', keywords: ['desk chair'] },
    { name: 'Coffee table' },
  ]
  const getText = (i: Item) => [i.name, ...(i.keywords ?? [])]

  it('ranks results best-first', () => {
    const out = fuzzySearch('chair', items, getText)
    expect(out.map((i) => i.name)).toEqual(['Dining chair', 'Office chair'])
  })

  it('finds via keywords', () => {
    const out = fuzzySearch('couch', items, getText)
    expect(out[0].name).toBe('3-seat sofa')
  })

  it('tolerates a small typo', () => {
    const out = fuzzySearch('chiar', items, getText)
    expect(out.some((i) => i.name === 'Dining chair')).toBe(true)
  })

  it('returns nothing for a totally unrelated query', () => {
    expect(fuzzySearch('xyzzy', items, getText)).toEqual([])
  })

  it('returns the full list (unranked) for an empty query', () => {
    expect(fuzzySearch('', items, getText)).toHaveLength(items.length)
  })
})
