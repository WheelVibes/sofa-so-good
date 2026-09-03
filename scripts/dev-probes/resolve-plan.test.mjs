/**
 * Tests for `PLAN=` name resolution.
 *
 * **The load-bearing part is the second block**, which runs against the SHIPPED
 * `PLAN_TEMPLATES`. It asserts each name this arc measured against resolves to a
 * unique template — and it asserts the resolved **id**, never the index, because
 * encoding the ordering would re-introduce the exact fragility the resolver exists
 * to remove.
 */
import { describe, expect, it } from 'vitest'
import { PLAN_TEMPLATES } from '../../src/floorplan/templates'
import { resolvePlanSpec } from './resolve-plan.mjs'

const FAKE = [
  { id: 'a', name: '2-Room Flexi' },
  { id: 'b', name: '4-Room' },
  { id: 'c', name: 'Executive Apartment' },
  { id: 'd', name: 'Executive Maisonette' },
]

describe('resolvePlanSpec', () => {
  it('still accepts an index, so existing invocations keep working', () => {
    expect(resolvePlanSpec(FAKE, '2')).toEqual({ index: 2, id: 'c', name: 'Executive Apartment' })
  })

  it('resolves an exact id', () => {
    expect(resolvePlanSpec(FAKE, 'b').index).toBe(1)
  })

  it('resolves a name case-insensitively', () => {
    expect(resolvePlanSpec(FAKE, '4-room').id).toBe('b')
  })

  it('resolves a unique partial', () => {
    expect(resolvePlanSpec(FAKE, 'Flexi').id).toBe('a')
  })

  it('REFUSES an ambiguous partial rather than taking the first match', () => {
    // The failure this prevents: running Maisonette while the log says Executive.
    const r = resolvePlanSpec(FAKE, 'Executive')
    expect(r.index).toBeUndefined()
    expect(r.error).toMatch(/AMBIGUOUS/)
    expect(r.error).toContain('Executive Apartment')
    expect(r.error).toContain('Executive Maisonette')
  })

  it('treats a name that STARTS with digits as a name, not an index', () => {
    // '3Gen' and '3-Room' would both truncate to index 3 under a bare parseInt.
    const list = [
      { id: 'x', name: 'zero' },
      { id: 'y', name: '3Gen' },
    ]
    expect(resolvePlanSpec(list, '3Gen').id).toBe('y')
    expect(resolvePlanSpec(list, '3').error).toMatch(/no template at index 3/)
  })

  it('lists the candidates when nothing matches, so the next attempt can succeed', () => {
    const r = resolvePlanSpec(FAKE, 'penthouse')
    expect(r.error).toContain('2-Room Flexi')
  })

  it('reports an out-of-range index instead of returning undefined', () => {
    expect(resolvePlanSpec(FAKE, '99').error).toMatch(/no template at index 99 of 4/)
  })

  it('rejects an empty or absent spec', () => {
    expect(resolvePlanSpec(FAKE, '').error).toBeTruthy()
    expect(resolvePlanSpec(FAKE, undefined).error).toBeTruthy()
    expect(resolvePlanSpec([], '0').error).toBeTruthy()
  })
})

describe('the SHIPPED template list', () => {
  // Every plan this arc has a physical reference for. Asserting the id keeps these
  // names meaningful across insertions; asserting an index would not.
  const REFERENCE_PLANS = {
    '4-Room': 'tpl-hdb-4room',
    '5-Room': 'tpl-hdb-5room',
    'Executive Apartment': 'tpl-hdb-exec',
  }

  for (const [spec, id] of Object.entries(REFERENCE_PLANS)) {
    it(`resolves ${spec} to ${id}`, () => {
      expect(resolvePlanSpec(PLAN_TEMPLATES, spec)).toMatchObject({ id })
    })
  }

  it('resolves every template by its own id and by its own name', () => {
    // A blanket check, so a future template whose name collides with another is
    // caught here rather than by a reference run silently using the wrong flat.
    for (const p of PLAN_TEMPLATES) {
      expect(resolvePlanSpec(PLAN_TEMPLATES, p.id), `id ${p.id}`).toMatchObject({ id: p.id })
      expect(resolvePlanSpec(PLAN_TEMPLATES, p.name), `name ${p.name}`).toMatchObject({ id: p.id })
    }
  })

  it("confirms 'Executive' alone really IS ambiguous in the shipped list", () => {
    // Evidence the ambiguity guard is doing work here and not just in the fake.
    expect(resolvePlanSpec(PLAN_TEMPLATES, 'Executive').error).toMatch(/AMBIGUOUS/)
  })
})
