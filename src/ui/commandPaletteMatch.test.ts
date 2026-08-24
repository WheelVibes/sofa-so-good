import { describe, expect, it } from 'vitest'
import { matchesQuery } from './CommandPalette'

/** The measure command as registered: its label shares no word with "measure". */
const measure = {
  id: 'measure',
  label: 'Toggle dimension labels',
  keywords: ['measure', 'dimensions', 'ruler', 'size', 'distance'],
}

describe('command palette matching', () => {
  it('finds a command by the name users know it by, not just its label', () => {
    // The regression this covers: label-only matching returned "No commands
    // match \"measure\"" while a measure command was registered and enabled.
    expect(matchesQuery(measure, 'measure')).toBe(true)
    expect(matchesQuery(measure, 'ruler')).toBe(true)
    expect(matchesQuery(measure, 'distance')).toBe(true)
  })

  it('still matches on the label', () => {
    expect(matchesQuery(measure, 'dimension')).toBe(true)
    expect(matchesQuery(measure, 'toggle')).toBe(true)
  })

  it('matches on the command id', () => {
    expect(matchesQuery({ id: 'smart-start', label: 'Furnish my flat' }, 'smart-start')).toBe(true)
  })

  it('does not match unrelated queries', () => {
    expect(matchesQuery(measure, 'wallpaper')).toBe(false)
    expect(matchesQuery({ id: 'share', label: 'Share design' }, 'zzz')).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(matchesQuery(measure, '')).toBe(true)
  })
})
