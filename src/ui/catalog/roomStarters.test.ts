import { describe, expect, it } from 'vitest'
import type { RoomKind } from '../../analysis/suggestions'
import { BUILTIN_CATALOG } from '../../furniture/builtinCatalog'
import { starterAnchorsForRoomKind } from './roomStarters'

describe('starterAnchorsForRoomKind', () => {
  const MAPPED: RoomKind[] = ['living', 'bedroom', 'kitchen', 'bath', 'dining', 'study']

  it('every starter id resolves in BUILTIN_CATALOG', () => {
    for (const kind of MAPPED) {
      for (const id of starterAnchorsForRoomKind(kind)) {
        expect(BUILTIN_CATALOG[id], `${kind} → ${id}`).toBeDefined()
      }
    }
  })

  it('returns the documented anchors for the primary kinds', () => {
    expect(starterAnchorsForRoomKind('bedroom')).toEqual([
      'bed-queen',
      'wardrobe-3door',
      'nightstand',
    ])
    expect(starterAnchorsForRoomKind('living')).toEqual([
      'sofa-3seat',
      'tv-console',
      'coffee-table',
    ])
    // Every mapped kind offers at least two anchors.
    for (const kind of MAPPED) {
      expect(starterAnchorsForRoomKind(kind).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('is empty for unmapped kinds and a null kind (falls back to the plain hint)', () => {
    expect(starterAnchorsForRoomKind('balcony')).toEqual([])
    expect(starterAnchorsForRoomKind('other')).toEqual([])
    expect(starterAnchorsForRoomKind(null)).toEqual([])
  })
})
