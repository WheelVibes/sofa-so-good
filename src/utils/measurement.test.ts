import { describe, expect, it } from 'vitest'
import { formatMeters, formatRoomSize } from './measurement'

describe('formatMeters', () => {
  it('formats with two decimals', () => {
    expect(formatMeters(2.6)).toBe('2.60 m')
  })
})

describe('formatRoomSize', () => {
  it('formats W × D · area', () => {
    expect(formatRoomSize(3.6, 3.4, 12.24)).toBe('3.60 × 3.40 m · 12.2 m²')
  })
})
