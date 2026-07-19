import { describe, expect, it } from 'vitest'
import type { PlanWall } from './types'
import {
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
    expect(isDemolitionRestricted('brick-partition')).toBe(false)
    expect(isDemolitionRestricted('drywall')).toBe(false)
    expect(isDemolitionRestricted('unknown')).toBe(false)
    expect(isDemolitionRestricted(undefined)).toBe(false)
  })
})
