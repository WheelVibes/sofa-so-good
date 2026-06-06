import { describe, expect, it } from 'vitest'
import { formatArea, formatDims, formatLength, formatMeters, formatRoomSize } from './measurement'

describe('formatMeters', () => {
  it('formats with two decimals', () => {
    expect(formatMeters(2.6)).toBe('2.60 m')
  })
})

describe('formatRoomSize', () => {
  it('formats W × D · area (metric default)', () => {
    expect(formatRoomSize(3.6, 3.4, 12.24)).toBe('3.60 × 3.40 m · 12.2 m²')
  })
  it('formats imperial feet-inches + sq ft', () => {
    // 3.6 m = 11.81 ft = 11′ 10″; 3.4 m = 11′ 2″; 12.24 m² ≈ 132 ft²
    expect(formatRoomSize(3.6, 3.4, 12.24, 'imperial')).toBe('11′ 10″ × 11′ 2″ · 132 ft²')
  })
})

describe('formatLength', () => {
  it('metric two decimals', () => {
    expect(formatLength(2.6)).toBe('2.60 m')
    expect(formatLength(2.6, 'metric')).toBe('2.60 m')
  })
  it('imperial feet + inches', () => {
    expect(formatLength(0.3048, 'imperial')).toBe('1′ 0″') // exactly 1 ft
    expect(formatLength(1, 'imperial')).toBe('3′ 3″') // 1 m = 39.37 in = 3 ft 3.37 in
  })
  it('imperial carries 12 inches up to the next foot', () => {
    // 0.295 m ≈ 11.61 in → rounds to 12 in → must carry to 1 ft 0 in, never "12″"
    expect(formatLength(0.295, 'imperial')).toBe('1′ 0″')
    expect(formatLength(0.295, 'imperial')).not.toContain('12″')
  })
  it('imperial sub-foot shows inches only', () => {
    expect(formatLength(0.1, 'imperial')).toBe('4″') // 3.94 in → 4
  })
  it('handles non-finite', () => {
    expect(formatLength(Number.NaN)).toBe('0 m')
    expect(formatLength(Number.NaN, 'imperial')).toBe('0″')
  })
})

describe('formatArea', () => {
  it('metric one decimal', () => {
    expect(formatArea(12.24)).toBe('12.2 m²')
  })
  it('imperial whole sq ft', () => {
    expect(formatArea(10, 'imperial')).toBe('108 ft²') // 10 × 10.7639
  })
})

describe('formatDims', () => {
  it('metric single trailing unit', () => {
    expect(formatDims(3.6, 3.4)).toBe('3.60 × 3.40 m')
  })
  it('imperial labels each dimension', () => {
    expect(formatDims(3.6, 3.4, 'imperial')).toBe('11′ 10″ × 11′ 2″')
  })
})
