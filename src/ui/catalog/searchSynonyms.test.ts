import { describe, expect, it } from 'vitest'
import {
  expandIntent,
  expandQuery,
  fuzzySearchSmart,
  matchedIntents,
  singularize,
} from './searchSynonyms'

describe('expandQuery', () => {
  it('returns the original (lower-cased) first and includes synonyms', () => {
    const out = expandQuery('couch')
    expect(out[0]).toBe('couch')
    expect(out).toContain('sofa')
    expect(out).toContain('settee')
  })

  it('substitutes a synonym term inside a longer phrase', () => {
    expect(expandQuery('leather couch')).toContain('leather sofa')
    expect(expandQuery('grey telly')).toContain('grey tv')
  })

  it('prefers the longest matching term (so "tv console" is not shadowed by "tv")', () => {
    const out = expandQuery('tv console')
    // Expanded via the tv-console group, not the bare tv group.
    expect(out).toContain('media unit')
    expect(out).toContain('entertainment unit')
  })

  it('is a no-op for an unknown term and for empty input', () => {
    expect(expandQuery('blorptron')).toEqual(['blorptron'])
    expect(expandQuery('  ')).toEqual([''])
  })
})

describe('fuzzySearchSmart', () => {
  type Item = { name: string; keywords?: string[] }
  const text = (i: Item) => [i.name, ...(i.keywords ?? [])]

  it('finds an item by a synonym even when it has NO keywords (packs/uploads)', () => {
    const items: Item[] = [{ name: 'Table' }, { name: 'Sofa' }, { name: 'Lamp' }]
    const hits = fuzzySearchSmart('couch', items, text)
    expect(hits[0]?.name).toBe('Sofa')
  })

  it('matches a synonym inside a phrase ("3-seater couch" → a Sofa)', () => {
    const items: Item[] = [{ name: 'Dining Chair' }, { name: '3-Seater Sofa' }]
    const hits = fuzzySearchSmart('3-seater couch', items, text)
    expect(hits[0]?.name).toBe('3-Seater Sofa')
  })

  it('ranks a literal name match above a synonym-only match', () => {
    const items: Item[] = [{ name: 'Sofa' }, { name: 'Couch Bed' }]
    // Query "couch": "Couch Bed" matches literally (substring); "Sofa" only via synonym.
    const hits = fuzzySearchSmart('couch', items, text)
    expect(hits[0]?.name).toBe('Couch Bed')
  })

  it('empty query returns every item in original order', () => {
    const items: Item[] = [{ name: 'B' }, { name: 'A' }, { name: 'C' }]
    expect(fuzzySearchSmart('', items, text).map((i) => i.name)).toEqual(['B', 'A', 'C'])
    expect(fuzzySearchSmart('   ', items, text).map((i) => i.name)).toEqual(['B', 'A', 'C'])
  })

  it('still does typo-tolerant matching on the original query', () => {
    const items: Item[] = [{ name: 'Chair' }, { name: 'Table' }]
    expect(fuzzySearchSmart('chiar', items, text)[0]?.name).toBe('Chair')
  })

  it('drops items that match neither the query nor any synonym', () => {
    const items: Item[] = [{ name: 'Sofa' }, { name: 'Refrigerator' }]
    const hits = fuzzySearchSmart('fridge', items, text)
    expect(hits.map((i) => i.name)).toEqual(['Refrigerator'])
  })

  it('matches a plural query against a singular catalog name', () => {
    const items: Item[] = [{ name: 'Sofa' }, { name: 'Chair' }, { name: 'Table' }]
    expect(fuzzySearchSmart('sofas', items, text)[0]?.name).toBe('Sofa')
    expect(fuzzySearchSmart('chairs', items, text)[0]?.name).toBe('Chair')
    expect(fuzzySearchSmart('tables', items, text)[0]?.name).toBe('Table')
  })

  it('matches a plural SYNONYM query ("couches" → Sofa)', () => {
    const items: Item[] = [{ name: 'Sofa' }, { name: 'Desk' }]
    expect(fuzzySearchSmart('couches', items, text)[0]?.name).toBe('Sofa')
  })
})

describe('expandIntent', () => {
  it('maps a room/use word to its typical item terms', () => {
    expect(expandIntent('bedroom')).toEqual(
      expect.arrayContaining(['bed', 'nightstand', 'wardrobe']),
    )
    expect(expandIntent('office')).toEqual(expect.arrayContaining(['desk', 'office chair']))
  })

  it('triggers on an intent word inside a phrase, and is empty otherwise', () => {
    expect(expandIntent('modern bedroom')).toContain('bed')
    expect(expandIntent('sofa')).toEqual([])
    expect(expandIntent('')).toEqual([])
  })
})

describe('fuzzySearchSmart — room/use intent', () => {
  type Item = { name: string }
  const text = (i: Item) => [i.name]

  it('"bedroom" surfaces bedroom furniture by name', () => {
    const items: Item[] = [
      { name: 'Queen Bed' },
      { name: 'Nightstand' },
      { name: 'Dining Table' },
      { name: 'Wardrobe' },
    ]
    const names = fuzzySearchSmart('bedroom', items, text).map((i) => i.name)
    expect(names).toEqual(expect.arrayContaining(['Queen Bed', 'Nightstand', 'Wardrobe']))
    expect(names).not.toContain('Dining Table')
  })

  it('a single-item word ("bed") does NOT broaden via intent', () => {
    const items: Item[] = [{ name: 'Queen Bed' }, { name: 'Nightstand' }]
    // "bed" matches the bed by name; the nightstand only comes via the bedroom
    // intent, which "bed" must not trigger.
    expect(fuzzySearchSmart('bed', items, text).map((i) => i.name)).toEqual(['Queen Bed'])
  })
})

describe('matchedIntents', () => {
  it('returns the room/use intent a query names', () => {
    expect(matchedIntents('bedroom')).toEqual(['bedroom'])
    expect(matchedIntents('home office setup')).toEqual(['office'])
  })

  it('is empty for a plain item query or blank input', () => {
    expect(matchedIntents('sofa')).toEqual([])
    expect(matchedIntents('   ')).toEqual([])
  })

  it('does not list an intent contained within a longer matched one', () => {
    // 'living room' contains no other key here, but the de-dup guard must never
    // return both a phrase and a substring of it.
    const out = matchedIntents('living room')
    expect(out).toContain('living room')
    expect(out).not.toContain('lounge')
  })
})

describe('singularize', () => {
  it('adds a singular form for regular plurals, leaves others intact', () => {
    expect(singularize('sofas')).toContain('sofa')
    expect(singularize('boxes')).toContain('box')
    expect(singularize('chair')).toEqual(['chair'])
  })
})
