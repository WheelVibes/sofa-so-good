import { describe, expect, it } from 'vitest'
import type { RenoAllocation, RenoTradeLine } from './renovationAllocator'
import { buildVariationRegister, VARIATION_EPSILON_SGD } from './variationRegister'

const line = (id: string, subtotal: number, quantity = 1): RenoTradeLine => ({
  id,
  label: id,
  quantity,
  unit: 'm²',
  rate: quantity > 0 ? subtotal / quantity : 0,
  subtotal,
  stage: 'Fit-out',
})

const alloc = (lines: RenoTradeLine[]): RenoAllocation =>
  ({
    lines,
    subtotal: lines.reduce((s, l) => s + l.subtotal, 0),
    contingency: 0,
    contingencyPct: 0,
    total: lines.reduce((s, l) => s + l.subtotal, 0),
    benchmarks: [],
  }) as RenoAllocation

describe('buildVariationRegister', () => {
  it('reports an ADDED trade as a positive delta', () => {
    const r = buildVariationRegister(alloc([]), alloc([line('tiling', 1000)]))
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]!.kind).toBe('added')
    expect(r.lines[0]!.deltaSgd).toBeCloseTo(1000, 2)
    expect(r.netSgd).toBeCloseTo(1000, 2)
  })

  it('reports an OMITTED trade as a credit, not a silent disappearance', () => {
    // An omitted trade is money BACK, and is exactly the kind of thing that
    // goes unclaimed if the register only lists additions.
    const r = buildVariationRegister(alloc([line('tiling', 1000)]), alloc([]))
    expect(r.lines[0]!.kind).toBe('omitted')
    expect(r.lines[0]!.deltaSgd).toBeCloseTo(-1000, 2)
    expect(r.omittedSgd).toBeCloseTo(-1000, 2)
    expect(r.netSgd).toBeCloseTo(-1000, 2)
  })

  it('reports a CHANGED trade with both quantities, so the cause is visible', () => {
    const r = buildVariationRegister(
      alloc([line('tiling', 1000, 10)]),
      alloc([line('tiling', 1500, 15)]),
    )
    const l = r.lines[0]!
    expect(l.kind).toBe('changed')
    expect(l.quantityBefore).toBe(10)
    expect(l.quantityAfter).toBe(15)
    expect(l.deltaSgd).toBeCloseTo(500, 2)
  })

  it('nets additions against omissions', () => {
    const r = buildVariationRegister(
      alloc([line('tiling', 1000), line('carpentry', 5000)]),
      alloc([line('tiling', 1400), line('carpentry', 4000)]),
    )
    expect(r.addedSgd).toBeCloseTo(400, 2)
    expect(r.omittedSgd).toBeCloseTo(-1000, 2)
    expect(r.netSgd).toBeCloseTo(-600, 2)
  })

  it('sorts by absolute delta — the biggest money first', () => {
    const r = buildVariationRegister(
      alloc([line('a', 100), line('b', 100)]),
      alloc([line('a', 150), line('b', 900)]),
    )
    expect(r.lines.map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('ignores sub-dollar noise rather than reporting a variation', () => {
    // Quantities are re-derived from each state, so floating-point residue is
    // expected. A register that reports a 3-cent "variation" gets ignored.
    const r = buildVariationRegister(
      alloc([line('tiling', 1000)]),
      alloc([line('tiling', 1000 + VARIATION_EPSILON_SGD / 2)]),
    )
    expect(r.lines).toEqual([])
    expect(r.unchanged).toBe(true)
  })

  it('reads unchanged when the two states match', () => {
    const same = alloc([line('tiling', 1000), line('carpentry', 5000)])
    const r = buildVariationRegister(same, same)
    expect(r.unchanged).toBe(true)
    expect(r.netSgd).toBe(0)
  })

  it('always carries the not-a-quotation caveat', () => {
    const r = buildVariationRegister(alloc([]), alloc([line('tiling', 1000)]))
    expect(r.note).toMatch(/indicative SG rate card, not a contractor/i)
    expect(r.note).toMatch(/priced properly before it is instructed/i)
    // And admits the rate card itself can move a line.
    expect(r.note).toMatch(/because the rate card did/i)
  })

  it('does not throw on malformed allocations', () => {
    expect(() => buildVariationRegister(null as never, alloc([line('a', 1)]))).not.toThrow()
    expect(() => buildVariationRegister(alloc([]), null as never)).not.toThrow()
  })
})
