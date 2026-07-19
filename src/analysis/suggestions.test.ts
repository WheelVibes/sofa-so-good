import { describe, expect, it } from 'vitest'
import { buildSuggestions, roomKindFromName, type SuggestionInput } from './suggestions'

const room = (
  id: string,
  name: string,
  areaSqm: number,
  itemCategories: string[],
): SuggestionInput['rooms'][number] => ({ id, name, areaSqm, itemCategories })

describe('roomKindFromName', () => {
  it('infers kinds from names, more specific patterns winning', () => {
    expect(roomKindFromName('Living / Dining')).toBe('living')
    expect(roomKindFromName('Dining Room')).toBe('dining')
    expect(roomKindFromName('Master Bedroom')).toBe('bedroom')
    expect(roomKindFromName('Kitchen')).toBe('kitchen')
    expect(roomKindFromName('Bathroom 2')).toBe('bath')
    expect(roomKindFromName('Home Office')).toBe('study')
    expect(roomKindFromName('Service Balcony')).toBe('balcony')
    expect(roomKindFromName('Storeroom')).toBe('balcony')
    expect(roomKindFromName('Foyer')).toBe('other')
    expect(roomKindFromName(undefined)).toBe('other')
  })
})

describe('buildSuggestions', () => {
  it('returns [] for empty / missing input', () => {
    expect(buildSuggestions({ rooms: [] })).toEqual([])
    expect(buildSuggestions(null)).toEqual([])
    expect(buildSuggestions(undefined)).toEqual([])
  })

  it('living room with seating + no tables suggests a coffee table (addCategory tables)', () => {
    const out = buildSuggestions({
      rooms: [room('lr', 'Living Room', 18, ['seating', 'lighting', 'decor', 'textiles'])],
    })
    const coffee = out.find((s) => /coffee table/i.test(s.message))
    expect(coffee).toBeDefined()
    expect(coffee?.addCategory).toBe('tables')
    expect(coffee?.roomId).toBe('lr')
  })

  it('living room with seating + media + no rug suggests a rug', () => {
    const out = buildSuggestions({
      rooms: [room('lr', 'Living Room', 18, ['seating', 'tables', 'media', 'lighting', 'decor'])],
    })
    const rug = out.find((s) => /rug/i.test(s.message))
    expect(rug).toBeDefined()
    expect(rug?.addCategory).toBe('textiles')
    expect(rug?.severity).toBe('idea')
  })

  it('bedroom with a bed + no storage suggests a wardrobe', () => {
    const out = buildSuggestions({
      rooms: [room('br', 'Master Bedroom', 14, ['beds', 'lighting'])],
    })
    const wardrobe = out.find((s) => /wardrobe/i.test(s.message))
    expect(wardrobe).toBeDefined()
    expect(wardrobe?.addCategory).toBe('storage')
  })

  it('dining table with no chairs suggests dining chairs', () => {
    const out = buildSuggestions({
      rooms: [room('dr', 'Dining Room', 10, ['tables', 'lighting'])],
    })
    const chairs = out.find((s) => /dining chairs/i.test(s.message))
    expect(chairs).toBeDefined()
    expect(chairs?.addCategory).toBe('seating')
  })

  it('an empty living room suggests furnishing it', () => {
    const out = buildSuggestions({ rooms: [room('lr', 'Living Room', 18, [])] })
    const furnish = out.find((s) => /furnish this room/i.test(s.message))
    expect(furnish).toBeDefined()
    expect(furnish?.addCategory).toBe('seating')
    // An empty room fires ONLY its single furnish rule, not every missing-X tip.
    expect(out).toHaveLength(1)
  })

  it('a fully-kitted living room yields few/no suggestions', () => {
    const out = buildSuggestions({
      rooms: [
        room('lr', 'Living Room', 18, [
          'seating',
          'tables',
          'media',
          'lighting',
          'decor',
          'textiles',
        ]),
      ],
    })
    expect(out).toHaveLength(0)
  })

  it('does not nag balcony / utility rooms to furnish', () => {
    const out = buildSuggestions({
      rooms: [
        room('b', 'Service Balcony', 6, []),
        room('s', 'Storeroom', 4, []),
        room('y', 'Yard', 8, []),
      ],
    })
    // No "furnish this room" nag for external/utility spaces.
    expect(out.some((s) => /furnish this room/i.test(s.message))).toBe(false)
    // But an empty balcony may get an optional outdoor idea (severity 'idea').
    const outdoor = out.find((s) => s.roomId === 'b')
    if (outdoor) {
      expect(outdoor.severity).toBe('idea')
      expect(outdoor.addCategory).toBe('outdoor')
    }
  })

  it('flags a large sparse room', () => {
    const out = buildSuggestions({
      rooms: [room('lr', 'Living Room', 25, ['seating'])],
    })
    expect(out.some((s) => /sparse/i.test(s.message))).toBe(true)
  })

  it('does not flag a small bare-ish room as sparse', () => {
    const out = buildSuggestions({
      rooms: [room('k', 'Kitchen', 6, ['kitchen'])],
    })
    expect(out.some((s) => /sparse/i.test(s.message))).toBe(false)
  })

  it('guards malformed rooms without throwing', () => {
    const out = buildSuggestions({
      // biome-ignore lint/suspicious/noExplicitAny: exercising defensive guards
      rooms: [{ id: 'x', name: 'Bedroom', areaSqm: Number.NaN, itemCategories: null } as any],
    })
    // NaN area + null categories => treated as empty bedroom => furnish tip.
    expect(out.some((s) => /furnish this room/i.test(s.message))).toBe(true)
  })

  it('is deterministic', () => {
    const input: SuggestionInput = { rooms: [room('lr', 'Living Room', 18, ['seating'])] }
    expect(buildSuggestions(input)).toEqual(buildSuggestions(input))
  })

  // --- RM1: explicit room category flows into suggestions -------------------
  it('an explicit category wins over the room name (a renamed bedroom is still a bedroom)', () => {
    const out = buildSuggestions({
      rooms: [{ ...room('br', "Ella's room", 12, []), category: 'bedroom' }],
    })
    // Empty + category bedroom => the bedroom furnish tip, not the generic
    // "furnish to bring it to life" an inferred 'other' room would get.
    const furnish = out.find((s) => s.roomId === 'br')
    expect(furnish?.message).toMatch(/start with a bed/i)
    expect(furnish?.addCategory).toBe('beds')
  })

  it('an explicit master bedroom downmaps to bedroom suggestions', () => {
    const out = buildSuggestions({
      rooms: [{ ...room('mb', 'Suite', 16, ['beds', 'lighting']), category: 'masterBedroom' }],
    })
    expect(out.some((s) => /wardrobe/i.test(s.message))).toBe(true)
  })

  // --- RM1-tail fix: utility rooms must NOT get the outdoor-seating idea -----
  it('a Household Shelter (name-inferred storeroom) gets NO outdoor-seating suggestion', () => {
    const out = buildSuggestions({ rooms: [room('hs', 'Household Shelter', 3, [])] })
    expect(out.some((s) => /outdoor seating|planters/i.test(s.message))).toBe(false)
    // A utility room is non-habitable — no furnishing nag at all.
    expect(out.filter((s) => s.roomId === 'hs')).toHaveLength(0)
  })

  it('a Service Yard gets no outdoor-seating suggestion (explicit or name)', () => {
    const byName = buildSuggestions({ rooms: [room('y', 'Service Yard', 5, [])] })
    expect(byName.some((s) => /outdoor seating|planters/i.test(s.message))).toBe(false)
    const byCategory = buildSuggestions({
      rooms: [{ ...room('y2', 'Utility', 5, []), category: 'serviceYard' }],
    })
    expect(byCategory.some((s) => /outdoor seating|planters/i.test(s.message))).toBe(false)
  })

  it('a genuine Balcony STILL gets the outdoor-seating idea (unchanged)', () => {
    // The outdoor idea fires for a non-empty balcony without outdoor/seating.
    const out = buildSuggestions({ rooms: [room('b', 'Balcony', 6, ['lighting'])] })
    const outdoor = out.find((s) => s.roomId === 'b')
    expect(outdoor?.message).toMatch(/outdoor seating|planters/i)
    expect(outdoor?.severity).toBe('idea')
    expect(outdoor?.addCategory).toBe('outdoor')
  })
})
