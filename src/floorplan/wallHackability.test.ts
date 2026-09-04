import { describe, expect, it } from 'vitest'
import type { PlanWall } from './types'
import {
  establishedWallStructure,
  type HackClass,
  hackClassDescription,
  hackClassLabel,
  isDemolitionRestricted,
  wallHackability,
} from './wallHackability'

describe('wallHackability', () => {
  const cases: Array<[PlanWall['structure'], HackClass]> = [
    ['load-bearing', 'no'],
    ['rc-partition', 'no'],
    ['gable-end', 'no'],
    ['brick-partition', 'permit'],
    ['drywall', 'permit'],
    ['unknown', 'unknown'],
  ]

  for (const [structure, expected] of cases) {
    it(`classifies ${structure} as ${expected}`, () => {
      expect(wallHackability(structure)).toBe(expected)
    })
  }

  it('treats undefined structure as unknown', () => {
    expect(wallHackability(undefined)).toBe('unknown')
    expect(wallHackability()).toBe('unknown')
  })

  it('labels each class', () => {
    expect(hackClassLabel('no')).toBe('Not permitted')
    expect(hackClassLabel('permit')).toBe('Permit required')
    expect(hackClassLabel('unknown')).toBe('Unclassified')
  })

  it('describes each class', () => {
    expect(hackClassDescription('no')).toMatch(/not permitted/i)
    expect(hackClassDescription('permit')).toMatch(/permit/i)
    expect(hackClassDescription('unknown')).toMatch(/confirm/i)
  })

  it('flags only structural walls as demolition-restricted', () => {
    expect(isDemolitionRestricted('load-bearing')).toBe(true)
    expect(isDemolitionRestricted('rc-partition')).toBe(true)
    expect(isDemolitionRestricted('gable-end')).toBe(true)
    expect(isDemolitionRestricted('brick-partition')).toBe(false)
    expect(isDemolitionRestricted('drywall')).toBe(false)
    expect(isDemolitionRestricted('unknown')).toBe(false)
    expect(isDemolitionRestricted(undefined)).toBe(false)
  })
})

/**
 * `establishedWallStructure` (v0.31.8.4). Every shipped template left `structure`
 * unset on every wall, so the hacking plan reported an entire flat —
 * facade included — as "Unclassified". HDB is unambiguous that external walls
 * cannot be hacked, so reporting that as unknown was a missing fact, not caution.
 */
describe('establishedWallStructure', () => {
  const w = (
    thickness: 'external' | 'internal',
    structure?: PlanWall['structure'],
  ): Pick<PlanWall, 'structure' | 'thickness'> => ({ thickness, structure })

  it('establishes an undeclared EXTERNAL wall as load-bearing', () => {
    expect(establishedWallStructure(w('external'))).toBe('load-bearing')
    expect(wallHackability(establishedWallStructure(w('external')))).toBe('no')
  })

  it('leaves an undeclared INTERNAL wall unknown', () => {
    // Deliberate: for a generic flat-TYPE archetype there is no single correct
    // answer, since structural layout varies by block and construction era. An
    // official per-block plan cannot classify a template, because a template is
    // not a block.
    expect(establishedWallStructure(w('internal'))).toBeUndefined()
    expect(wallHackability(establishedWallStructure(w('internal')))).toBe('unknown')
  })

  it('never overrides a declaration, including a surprising one', () => {
    // A user who declares their external wall a drywall is wrong, but it is
    // their declaration and this function only fills blanks.
    expect(establishedWallStructure(w('external', 'drywall'))).toBe('drywall')
    expect(establishedWallStructure(w('internal', 'load-bearing'))).toBe('load-bearing')
    expect(establishedWallStructure(w('external', 'gable-end'))).toBe('gable-end')
  })

  it('does not claim gable-end for a plain facade wall', () => {
    // `gable-end` is specifically the block's exposed END wall, which cannot be
    // told apart from any other external wall here. Both classify as 'no', so
    // nothing is under-reported by staying with 'load-bearing'.
    expect(establishedWallStructure(w('external'))).not.toBe('gable-end')
  })

  it('is idempotent — resolving twice changes nothing', () => {
    const once = establishedWallStructure(w('external'))
    expect(establishedWallStructure({ thickness: 'external', structure: once })).toBe(once)
  })
})
