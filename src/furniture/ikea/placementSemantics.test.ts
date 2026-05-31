import { describe, expect, it } from 'vitest'
import { placementKind } from './placementSemantics'

describe('placementKind', () => {
  it('classifies mattresses + bed bases as vertical', () => {
    expect(placementKind('Foam & latex mattresses')).toBe('vertical')
    expect(placementKind('Spring mattresses')).toBe('vertical')
    expect(placementKind('Slatted bed bases')).toBe('vertical')
  })

  it('classifies seating-around-a-table as around', () => {
    expect(placementKind('Kitchen dining chairs')).toBe('around')
    expect(placementKind('Stools')).toBe('around')
    expect(placementKind('Dining benches')).toBe('around')
    expect(placementKind('Upholstered chairs')).toBe('around')
    expect(placementKind('Storage benches')).toBe('around')
  })

  it('classifies the broader vertical taxonomy', () => {
    expect(placementKind('Mattress pads & toppers')).toBe('vertical')
    expect(placementKind('Mattress protectors')).toBe('vertical')
    expect(placementKind('Chair pads')).toBe('vertical')
    expect(placementKind('Back cushions')).toBe('vertical')
    expect(placementKind('Seat cushions')).toBe('vertical')
  })

  it('classifies sofa sections/corners as modular (checked before around/vertical)', () => {
    expect(placementKind('Sofa sections')).toBe('modular')
    expect(placementKind('Corner sections')).toBe('modular')
    expect(placementKind('Chaise longue sections')).toBe('modular')
    expect(placementKind('Armrests')).toBe('modular')
  })

  it('returns null for unclassified phrases (gate the action off)', () => {
    expect(placementKind('Mysterious widgets')).toBeNull()
    expect(placementKind('Curtains')).toBeNull()
  })
})
