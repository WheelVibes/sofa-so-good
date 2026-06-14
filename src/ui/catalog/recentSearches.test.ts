import { describe, expect, it } from 'vitest'
import { addRecent, parseRecent } from './recentSearches'

describe('addRecent', () => {
  it('inserts most-recent-first', () => {
    expect(addRecent(['a'], 'b')).toEqual(['b', 'a'])
  })

  it('de-duplicates case-insensitively, moving the term to the front', () => {
    expect(addRecent(['Sofa', 'desk'], 'sofa')).toEqual(['sofa', 'desk'])
  })

  it('ignores blank queries', () => {
    expect(addRecent(['a'], '   ')).toEqual(['a'])
    expect(addRecent(['a'], '')).toEqual(['a'])
  })

  it('trims the stored query', () => {
    expect(addRecent([], '  sofa  ')).toEqual(['sofa'])
  })

  it('caps the list length (newest kept)', () => {
    let list: string[] = []
    for (const q of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) list = addRecent(list, q)
    expect(list).toHaveLength(6)
    expect(list[0]).toBe('g')
    expect(list).not.toContain('a')
  })
})

describe('parseRecent', () => {
  it('returns [] for missing / malformed input', () => {
    expect(parseRecent(null)).toEqual([])
    expect(parseRecent('not json')).toEqual([])
    expect(parseRecent('{"a":1}')).toEqual([])
  })

  it('keeps only non-blank strings, capped', () => {
    expect(parseRecent('["sofa", 3, "", "desk"]')).toEqual(['sofa', 'desk'])
  })
})
