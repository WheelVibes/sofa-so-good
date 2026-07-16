import { describe, expect, it } from 'vitest'
import { validateProductConstraints } from './constraints'
import type { ConfigurableProduct, SlotConstraint, SlotOption } from './model'

/** A two-slot product (Top: glass/oak, Legs: steel/wood) with hand-set
 *  constraints — the shape the designer→product mapping produces. */
function twoSlotProduct(constraints: SlotConstraint[] = []): ConfigurableProduct {
  const opt = (id: string, label: string): SlotOption => ({
    id,
    label,
    price: 0,
    footprint: { w: 1, d: 1, h: 1 },
  })
  return {
    id: 'p',
    label: 'P',
    category: 'others',
    base: { footprint: { w: 1, d: 1, h: 1 }, price: 0 },
    slots: [
      {
        id: 'Top',
        label: 'Top',
        anchor: { position: [0, 0, 0] },
        defaultOptionId: 'g-oak',
        options: [opt('g-glass', 'Glass'), opt('g-oak', 'Oak')],
      },
      {
        id: 'Legs',
        label: 'Legs',
        anchor: { position: [0, 0, 0] },
        defaultOptionId: 'g-wood',
        options: [opt('g-steel', 'Steel'), opt('g-wood', 'Wood')],
      },
    ],
    constraints,
  }
}

describe('validateProductConstraints (Stage 7d)', () => {
  it('returns no problems for internally-consistent rules', () => {
    const product = twoSlotProduct([
      {
        kind: 'requires',
        ifSlot: 'Top',
        ifOption: 'g-glass',
        thenSlot: 'Legs',
        thenOption: 'g-steel',
      },
    ])
    expect(validateProductConstraints(product)).toEqual([])
  })

  it('flags an option that both requires AND excludes the same target (contradiction)', () => {
    const product = twoSlotProduct([
      {
        kind: 'requires',
        ifSlot: 'Top',
        ifOption: 'g-glass',
        thenSlot: 'Legs',
        thenOption: 'g-steel',
      },
      {
        kind: 'excludes',
        slot: 'Top',
        option: 'g-glass',
        conflictsWith: { slot: 'Legs', option: 'g-steel' },
      },
    ])
    const problems = validateProductConstraints(product)
    expect(problems.some((p) => /both requires and excludes/i.test(p))).toBe(true)
  })

  it('flags a circular requires that makes a slot unsatisfiable', () => {
    // Glass forces Steel; Steel forces Oak → picking Glass forces Top to be both
    // Glass and Oak: impossible.
    const product = twoSlotProduct([
      {
        kind: 'requires',
        ifSlot: 'Top',
        ifOption: 'g-glass',
        thenSlot: 'Legs',
        thenOption: 'g-steel',
      },
      {
        kind: 'requires',
        ifSlot: 'Legs',
        ifOption: 'g-steel',
        thenSlot: 'Top',
        thenOption: 'g-oak',
      },
    ])
    const problems = validateProductConstraints(product)
    expect(problems.some((p) => /can't be satisfied/i.test(p))).toBe(true)
  })

  it('flags a requires rule pointing at a removed option (dangling)', () => {
    const product = twoSlotProduct([
      {
        kind: 'requires',
        ifSlot: 'Top',
        ifOption: 'g-glass',
        thenSlot: 'Legs',
        thenOption: 'gone',
      },
    ])
    const problems = validateProductConstraints(product)
    expect(problems.some((p) => /no longer exists/i.test(p))).toBe(true)
  })
})
