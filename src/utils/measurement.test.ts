import { describe, expect, it } from 'vitest'
import {
  drawingUnitsNote,
  formatArea,
  formatBytes,
  formatDims,
  formatDimsShort,
  formatDrawingLength,
  formatLength,
  formatRoomSize,
} from './measurement'

describe('formatBytes', () => {
  it('formats B / KB / MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB')
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

describe('formatDimsShort', () => {
  it('metric centimetres with single trailing unit', () => {
    expect(formatDimsShort([0.6, 0.45])).toBe('60 × 45 cm')
    expect(formatDimsShort([0.6, 0.45, 0.9])).toBe('60 × 45 × 90 cm')
  })
  it('imperial whole inches, labelled per value', () => {
    // 0.6 m = 23.6 in → 24″; 0.45 m = 17.7 in → 18″
    expect(formatDimsShort([0.6, 0.45], 'imperial')).toBe('24″ × 18″')
  })
  it('coerces non-finite to 0', () => {
    expect(formatDimsShort([Number.NaN, 0.5])).toBe('0 × 50 cm')
  })
})

describe('formatDrawingLength', () => {
  it('renders metric as integer millimetres with no unit suffix', () => {
    expect(formatDrawingLength(2.745)).toBe('2745')
    expect(formatDrawingLength(5)).toBe('5000')
    expect(formatDrawingLength(0.09)).toBe('90')
  })

  it('keeps the millimetre `formatLength` would have rounded away', () => {
    // The whole point of G10: 2.745 m is a real joinery dimension and
    // `formatLength` quantises it to the nearest 10 mm.
    expect(formatLength(2.745, 'metric')).toBe('2.75 m')
    expect(formatDrawingLength(2.745, 'metric')).toBe('2745')
  })

  it('rounds to the nearest whole millimetre', () => {
    expect(formatDrawingLength(1.00049)).toBe('1000')
    expect(formatDrawingLength(1.00051)).toBe('1001')
  })

  it('renders imperial to the nearest 1/8 inch in lowest terms', () => {
    expect(formatDrawingLength(5, 'imperial')).toBe('16′ 4 7/8″')
    expect(formatDrawingLength(4, 'imperial')).toBe('13′ 1 1/2″')
  })

  it('is finer than the nearest-inch imperial `formatLength` produces', () => {
    expect(formatLength(5, 'imperial')).toBe('16′ 5″')
    expect(formatDrawingLength(5, 'imperial')).toBe('16′ 4 7/8″')
  })

  it('omits the fraction when the value lands on a whole inch', () => {
    expect(formatDrawingLength(0.0254, 'imperial')).toBe('1″')
  })

  it('shows a sub-foot imperial value as inches only', () => {
    expect(formatDrawingLength(0.1, 'imperial')).toBe('3 7/8″')
  })

  it('handles zero and non-finite input without NaN', () => {
    expect(formatDrawingLength(0)).toBe('0')
    expect(formatDrawingLength(Number.NaN)).toBe('0')
    expect(formatDrawingLength(Number.NaN, 'imperial')).toBe('0″')
  })

  it('keeps a negative sign', () => {
    expect(formatDrawingLength(-1.5)).toBe('-1500')
  })
})

describe('drawingUnitsNote', () => {
  it('states the unit once, for the title block', () => {
    expect(drawingUnitsNote('metric')).toBe('ALL DIMENSIONS IN MILLIMETRES')
    expect(drawingUnitsNote('imperial')).toBe('ALL DIMENSIONS IN FEET AND INCHES')
  })
})
