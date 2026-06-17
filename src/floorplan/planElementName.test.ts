import { describe, expect, it } from 'vitest'
import {
  defaultOpeningName,
  defaultWallName,
  hash6,
  openingDisplayName,
  wallDisplayName,
} from './planElementName'

describe('hash6', () => {
  it('is a stable 6-digit string for an id', () => {
    const h = hash6('w-abc-1')
    expect(h).toMatch(/^\d{6}$/)
    expect(hash6('w-abc-1')).toBe(h) // deterministic
  })

  it('differs between ids (no trivial collisions on close ids)', () => {
    expect(hash6('w-abc-1')).not.toBe(hash6('w-abc-2'))
  })
})

describe('default names', () => {
  it('labels walls and openings by kind', () => {
    expect(defaultWallName({ id: 'w1' })).toBe(`Wall ${hash6('w1')}`)
    expect(defaultOpeningName({ id: 'o1', kind: 'door' })).toBe(`Door ${hash6('o1')}`)
    expect(defaultOpeningName({ id: 'o2', kind: 'window' })).toBe(`Window ${hash6('o2')}`)
  })
})

describe('display names — custom takes precedence', () => {
  it('uses the custom name when set, else the default', () => {
    expect(wallDisplayName({ id: 'w1', name: 'Living room wall 01' })).toBe('Living room wall 01')
    expect(wallDisplayName({ id: 'w1' })).toBe(defaultWallName({ id: 'w1' }))
    // A blank/whitespace name falls back to the default (never an empty label).
    expect(wallDisplayName({ id: 'w1', name: '   ' })).toBe(defaultWallName({ id: 'w1' }))
    expect(openingDisplayName({ id: 'o1', kind: 'door', name: 'Front door' })).toBe('Front door')
    expect(openingDisplayName({ id: 'o1', kind: 'window' })).toBe(
      defaultOpeningName({ id: 'o1', kind: 'window' }),
    )
  })
})
