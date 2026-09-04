import { describe, expect, it } from 'vitest'
import {
  ROOM_CATEGORY_LABELS,
  roomCategory,
  roomCategoryFromName,
  toArrangeKind,
  toRoomKind,
} from './roomCategory'
import { ROOM_CATEGORIES } from './types'

describe('roomCategoryFromName', () => {
  const cases: Array<[string, ReturnType<typeof roomCategoryFromName>]> = [
    ['Living / Dining', 'living'],
    ['Living Room', 'living'],
    ['Hall', 'living'],
    ['Dining', 'dining'],
    ['Bedroom 2', 'bedroom'],
    ['Master Bedroom', 'masterBedroom'],
    ['Main Bedroom', 'masterBedroom'],
    ['Primary Bedroom', 'masterBedroom'],
    ['Kitchen', 'kitchen'],
    ['Open Kitchen', 'kitchen'],
    ['Common Bath', 'bath'],
    ['Powder Room', 'powder'],
    ['WC', 'powder'],
    ['Study', 'study'],
    ['Home Office', 'study'],
    ['Service Yard', 'serviceYard'],
    ['Utility', 'serviceYard'],
    ['Laundry', 'serviceYard'],
    // A household shelter is its OWN category, not a store room (v0.31.8.25):
    // its RC walls may not be altered and it is windowless by design, so the
    // daylight check must never advise a window there.
    // v0.31.8.44 — names the templates actually use that used to fall through.
    // "Bedroom 2 Hall" is the ordering case: `hall` matched the living rule
    // before the bedroom rule ran, so an exec bedroom read as a living room.
    ['Bedroom 2 Hall', 'bedroom'],
    ['Grandparent Suite', 'masterBedroom'],
    ['Sleeping Loft', 'bedroom'],
    ['Stair Hall', 'foyer'],
    ['Stair Landing', 'foyer'],
    ['Stairs', 'foyer'],
    ['Family Area', 'living'],
    // ...and the ones the narrow rules must NOT swallow.
    ['Living / Sleeping', 'living'],
    ['Hall', 'living'],
    ['Household Shelter', 'shelter'],
    ['HS', 'shelter'],
    ['Store Room', 'storeroom'],
    ['Store', 'storeroom'],
    ['Balcony', 'balcony'],
    ['Foyer', 'foyer'],
    ['Entrance', 'foyer'],
    ['Corridor', 'foyer'],
    ["Ella's room", 'other'],
    ['', 'other'],
  ]
  it.each(cases)('%s → %s', (name, expected) => {
    expect(roomCategoryFromName(name)).toBe(expected)
  })

  it('is total: every ROOM_CATEGORIES value is reachable and the fn never throws', () => {
    for (const c of ROOM_CATEGORIES) {
      expect(ROOM_CATEGORY_LABELS[c]).toBeTruthy()
    }
    expect(() => roomCategoryFromName(undefined)).not.toThrow()
  })
})

describe('roomCategory', () => {
  it('explicit category wins over name inference', () => {
    expect(roomCategory({ name: "Ella's room", category: 'bedroom' })).toBe('bedroom')
    expect(roomCategory({ name: 'Master Bedroom', category: 'study' })).toBe('study')
  })

  it('falls back to name inference when category is absent', () => {
    expect(roomCategory({ name: 'Kitchen' })).toBe('kitchen')
    expect(roomCategory({ name: "Ella's room" })).toBe('other')
  })
})

describe('toRoomKind', () => {
  it('downmaps the extended categories to the coarse RoomKind', () => {
    expect(toRoomKind('masterBedroom')).toBe('bedroom')
    expect(toRoomKind('powder')).toBe('bath')
    expect(toRoomKind('serviceYard')).toBe('balcony')
    expect(toRoomKind('storeroom')).toBe('balcony')
    expect(toRoomKind('foyer')).toBe('balcony')
  })

  it('maps 1:1 for the rest', () => {
    for (const c of [
      'living',
      'dining',
      'bedroom',
      'kitchen',
      'bath',
      'study',
      'balcony',
      'other',
    ] as const) {
      expect(toRoomKind(c)).toBe(c)
    }
  })
})

describe('toArrangeKind', () => {
  it('collapses living+dining to living, master to bedroom, powder to bath', () => {
    expect(toArrangeKind('living')).toBe('living')
    expect(toArrangeKind('dining')).toBe('living')
    expect(toArrangeKind('masterBedroom')).toBe('bedroom')
    expect(toArrangeKind('bedroom')).toBe('bedroom')
    expect(toArrangeKind('powder')).toBe('bath')
    expect(toArrangeKind('bath')).toBe('bath')
    expect(toArrangeKind('kitchen')).toBe('kitchen')
  })

  it('everything else is generic', () => {
    for (const c of ['study', 'serviceYard', 'storeroom', 'balcony', 'foyer', 'other'] as const) {
      expect(toArrangeKind(c)).toBe('generic')
    }
  })
})
