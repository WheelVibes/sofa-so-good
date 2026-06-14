import { describe, expect, it } from 'vitest'
import { viewFileName } from './renderAllViews'

describe('viewFileName', () => {
  it('builds a plan-prefixed, zero-padded, slugified name', () => {
    expect(viewFileName('My Flat', 'Living Room', 0)).toBe('my-flat-01-living-room.png')
    expect(viewFileName('My Flat', 'Kitchen', 9)).toBe('my-flat-10-kitchen.png')
  })

  it('falls back when names are empty or punctuation-only', () => {
    expect(viewFileName('', '', 0)).toBe('home-01-view-1.png')
    expect(viewFileName('!!!', '???', 2)).toBe('home-03-view-3.png')
  })

  it('keeps the index sortable past nine views', () => {
    const names = [0, 10, 11].map((i) => viewFileName('plan', `v${i}`, i))
    expect(names).toEqual(['plan-01-v0.png', 'plan-11-v10.png', 'plan-12-v11.png'])
  })
})
