import { describe, expect, it } from 'vitest'
import type { RoomTileCoursing } from '../floorplan/tileCoursing'
import { buildSpecification, SPEC_SCOPE_NOTE, type SpecificationInput } from './specification'

const noFinishes = { floor: [], wall: [], ceiling: [] }

function input(over: Partial<SpecificationInput> = {}): SpecificationInput {
  return { finishNames: noFinishes, ...over }
}

const coursing = [{ roomId: 'r', roomName: 'Kitchen' } as unknown as RoomTileCoursing]

describe('buildSpecification', () => {
  it('emits no clauses for an empty design, and says so', () => {
    const spec = buildSpecification(input())
    expect(spec.clauses).toEqual([])
    // The point: absence is stated, not implied by an empty document.
    expect(spec.tradesNotCovered).toHaveLength(6)
  })

  it('always carries the scope note', () => {
    expect(buildSpecification(input()).scopeNote).toBe(SPEC_SCOPE_NOTE)
  })

  it('cites no standard code numbers anywhere', () => {
    // A fabricated citation reads as authoritative, so every clause must leave
    // `standardRef` for the user and no clause text may assert a code.
    const spec = buildSpecification(
      input({
        finishNames: { floor: ['Porcelain'], wall: ['Emulsion'], ceiling: ['Emulsion'] },
        coursing,
        wetRoomNames: ['Bath'],
        carpentryNames: ['Wardrobe'],
        mep: { electrical: 3, plumbing: 2 },
      }),
    )
    expect(spec.clauses.length).toBeGreaterThan(0)
    for (const c of spec.clauses) {
      expect(c.standardRef).toBe('')
      const text = `${c.workmanship} ${c.tolerance} ${c.preparation} ${c.substrate}`
      // No "SS 123" / "BS 5385" / "EN 12464"-shaped references.
      expect(text).not.toMatch(/\b(SS|BS|EN|ISO|ASTM|AS\/NZS)\s?\d/)
    }
  })

  it('emits a tiling clause only when there is tiling', () => {
    expect(buildSpecification(input()).clauses.some((c) => c.trade === 'tiler')).toBe(false)
    const withTile = buildSpecification(input({ coursing }))
    expect(withTile.clauses.some((c) => c.trade === 'tiler')).toBe(true)
    expect(withTile.tradesNotCovered).not.toContain('tiler')
  })

  it('emits both waterproofing clauses, including the test-before-covering one', () => {
    const spec = buildSpecification(input({ wetRoomNames: ['Bath/WC 1', 'Kitchen'] }))
    const wpf = spec.clauses.filter((c) => c.trade === 'waterproofing')
    expect(wpf).toHaveLength(2)
    expect(wpf[1]!.title).toMatch(/testing before covering/i)
    // Sequential, quotable clause ids per trade prefix.
    expect(wpf.map((c) => c.id)).toEqual(['WPF-01', 'WPF-02'])
  })

  it('names the actual wet rooms in the substrate clause', () => {
    const spec = buildSpecification(input({ wetRoomNames: ['Bath/WC 1', 'Kitchen'] }))
    expect(spec.clauses[0]!.substrate).toContain('Bath/WC 1 and Kitchen')
  })

  it('emits a painting clause from wall OR ceiling finishes', () => {
    expect(
      buildSpecification(
        input({ finishNames: { floor: [], wall: ['Off-white emulsion'], ceiling: [] } }),
      ).clauses.some((c) => c.trade === 'painter'),
    ).toBe(true)
    expect(
      buildSpecification(
        input({ finishNames: { floor: [], wall: [], ceiling: ['Flat white'] } }),
      ).clauses.some((c) => c.trade === 'painter'),
    ).toBe(true)
  })

  it('emits MEP clauses only when points are designed, and pluralises honestly', () => {
    expect(buildSpecification(input({ mep: { electrical: 0, plumbing: 0 } })).clauses).toEqual([])
    const one = buildSpecification(input({ mep: { electrical: 1, plumbing: 0 } }))
    expect(one.clauses[0]!.product).toContain('1 designed electrical point as scheduled')
    const many = buildSpecification(input({ mep: { electrical: 4, plumbing: 0 } }))
    expect(many.clauses[0]!.product).toContain('4 designed electrical points')
  })

  it('excludes circuit design and certification from the electrical clause', () => {
    // The honest scope limit: this is a layout spec, not an electrical design.
    const spec = buildSpecification(input({ mep: { electrical: 2, plumbing: 0 } }))
    expect(spec.clauses[0]!.exclusions).toMatch(/circuit design/i)
    expect(spec.clauses[0]!.exclusions).toMatch(/licensed electrical worker/i)
  })

  it('gives every clause a measurable tolerance and an exclusions line', () => {
    const spec = buildSpecification(
      input({
        finishNames: { floor: ['Porcelain'], wall: ['Emulsion'], ceiling: [] },
        coursing,
        wetRoomNames: ['Bath'],
        carpentryNames: ['Wardrobe'],
        mep: { electrical: 1, plumbing: 1 },
      }),
    )
    for (const c of spec.clauses) {
      expect(c.tolerance.trim().length).toBeGreaterThan(10)
      expect(c.exclusions.trim().length).toBeGreaterThan(10)
      expect(c.product.trim()).not.toBe('')
    }
  })

  it('numbers clauses per trade prefix, independently', () => {
    const spec = buildSpecification(
      input({ coursing, wetRoomNames: ['Bath'], carpentryNames: ['Wardrobe'] }),
    )
    expect(spec.clauses.map((c) => c.id)).toEqual(['TIL-01', 'WPF-01', 'WPF-02', 'CPT-01'])
  })

  it('lists only genuinely uncovered trades', () => {
    const spec = buildSpecification(
      input({
        finishNames: { floor: [], wall: ['Emulsion'], ceiling: [] },
        coursing,
        wetRoomNames: ['Bath'],
        carpentryNames: ['Wardrobe'],
        mep: { electrical: 1, plumbing: 1 },
      }),
    )
    expect(spec.tradesNotCovered).toEqual([])
  })

  it('dedupes repeated finish names in prose', () => {
    const spec = buildSpecification(
      input({ finishNames: { floor: [], wall: ['Emulsion', 'Emulsion'], ceiling: ['Emulsion'] } }),
    )
    expect(spec.clauses[0]!.product).toBe('Emulsion')
  })
})
