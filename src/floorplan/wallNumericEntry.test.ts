import { describe, expect, it } from 'vitest'
import {
  endpointFromLengthAngle,
  parseAngleInput,
  parseLengthInput,
  segmentLengthAngle,
  validateAngle,
  validateLength,
} from './wallNumericEntry'

describe('endpointFromLengthAngle', () => {
  it('goes right at 0°', () => {
    const [x, z] = endpointFromLengthAngle([0, 0], 3, 0)
    expect(x).toBeCloseTo(3)
    expect(z).toBeCloseTo(0)
  })

  it('goes down at 90°', () => {
    const [x, z] = endpointFromLengthAngle([0, 0], 4, 90)
    expect(x).toBeCloseTo(0)
    expect(z).toBeCloseTo(4)
  })

  it('goes left at 180°', () => {
    const [x, z] = endpointFromLengthAngle([0, 0], 2, 180)
    expect(x).toBeCloseTo(-2)
    expect(z).toBeCloseTo(0)
  })

  it('goes up at 270°', () => {
    const [x, z] = endpointFromLengthAngle([0, 0], 5, 270)
    expect(x).toBeCloseTo(0)
    expect(z).toBeCloseTo(-5)
  })

  it('handles a non-zero start point', () => {
    const [x, z] = endpointFromLengthAngle([1, 2], 3, 0)
    expect(x).toBeCloseTo(4)
    expect(z).toBeCloseTo(2)
  })
})

describe('segmentLengthAngle', () => {
  it('horizontal right → 0°, length 3', () => {
    const { length, angle } = segmentLengthAngle([0, 0], [3, 0])
    expect(length).toBeCloseTo(3)
    expect(angle).toBeCloseTo(0)
  })

  it('vertical down → 90°', () => {
    const { length, angle } = segmentLengthAngle([0, 0], [0, 4])
    expect(length).toBeCloseTo(4)
    expect(angle).toBeCloseTo(90)
  })

  it('horizontal left → 180°', () => {
    const { length, angle } = segmentLengthAngle([0, 0], [-2, 0])
    expect(length).toBeCloseTo(2)
    expect(angle).toBeCloseTo(180)
  })

  it('vertical up → 270°', () => {
    const { angle } = segmentLengthAngle([0, 0], [0, -5])
    expect(angle).toBeCloseTo(270)
  })

  it('angle is always in [0, 360)', () => {
    const { angle } = segmentLengthAngle([1, 1], [0, 0])
    expect(angle).toBeGreaterThanOrEqual(0)
    expect(angle).toBeLessThan(360)
  })
})

describe('parseLengthInput', () => {
  it('returns null for empty string', () => {
    expect(parseLengthInput('')).toBeNull()
    expect(parseLengthInput('  ')).toBeNull()
  })

  it('parses plain metric numbers', () => {
    expect(parseLengthInput('3')).toBeCloseTo(3)
    expect(parseLengthInput('3.5')).toBeCloseTo(3.5)
    expect(parseLengthInput('0.6')).toBeCloseTo(0.6)
  })

  it('parses metres with unit label', () => {
    expect(parseLengthInput('2m')).toBeCloseTo(2)
    expect(parseLengthInput('2 m')).toBeCloseTo(2)
    expect(parseLengthInput('3.5M')).toBeCloseTo(3.5)
  })

  it('parses centimetres', () => {
    expect(parseLengthInput('350cm')).toBeCloseTo(3.5)
    expect(parseLengthInput('350 cm')).toBeCloseTo(3.5)
  })

  it('parses feet-and-inches', () => {
    // 3' 6" = 3.5 ft = 1.0668 m
    expect(parseLengthInput('3\' 6"')).toBeCloseTo(1.0668, 3)
    expect(parseLengthInput('3\'6"')).toBeCloseTo(1.0668, 3)
    expect(parseLengthInput('3ft 6in')).toBeCloseTo(1.0668, 3)
    // feet only
    expect(parseLengthInput("3'")).toBeCloseTo(0.9144, 3)
    expect(parseLengthInput('3ft')).toBeCloseTo(0.9144, 3)
  })

  it('parses inches only', () => {
    expect(parseLengthInput('42"')).toBeCloseTo(42 * 0.0254, 4)
    expect(parseLengthInput('42in')).toBeCloseTo(42 * 0.0254, 4)
  })

  it('returns NaN for unparseable strings', () => {
    expect(parseLengthInput('abc')).toBeNaN()
    expect(parseLengthInput('!!')).toBeNaN()
  })

  it('returns negative values for negative inputs', () => {
    expect(parseLengthInput('-1')).toBeCloseTo(-1)
    expect(parseLengthInput("-1'")).toBeCloseTo(-0.3048, 3)
  })
})

describe('parseAngleInput', () => {
  it('returns null for empty string', () => {
    expect(parseAngleInput('')).toBeNull()
    expect(parseAngleInput('  ')).toBeNull()
  })

  it('parses plain numbers', () => {
    expect(parseAngleInput('90')).toBeCloseTo(90)
    expect(parseAngleInput('45.5')).toBeCloseTo(45.5)
  })

  it('normalises angles into [0, 360)', () => {
    expect(parseAngleInput('-90')).toBeCloseTo(270)
    expect(parseAngleInput('360')).toBeCloseTo(0)
    expect(parseAngleInput('450')).toBeCloseTo(90)
  })

  it('returns NaN for invalid strings', () => {
    expect(parseAngleInput('abc')).toBeNaN()
  })
})

describe('validateLength', () => {
  it('returns null for null (empty)', () => {
    expect(validateLength(null)).toBeNull()
  })

  it('returns null for valid lengths', () => {
    expect(validateLength(1)).toBeNull()
    expect(validateLength(0.1)).toBeNull()
    expect(validateLength(100)).toBeNull()
  })

  it('returns error for zero or negative', () => {
    expect(validateLength(0)).not.toBeNull()
    expect(validateLength(-1)).not.toBeNull()
  })

  it('returns error for absurd values', () => {
    expect(validateLength(9999)).not.toBeNull()
  })

  it('returns error for NaN/Infinity', () => {
    expect(validateLength(Number.NaN)).not.toBeNull()
    expect(validateLength(Number.POSITIVE_INFINITY)).not.toBeNull()
  })
})

describe('validateAngle', () => {
  it('returns null for null (empty)', () => {
    expect(validateAngle(null)).toBeNull()
  })

  it('returns null for valid angles', () => {
    expect(validateAngle(0)).toBeNull()
    expect(validateAngle(180)).toBeNull()
    expect(validateAngle(359.9)).toBeNull()
  })

  it('returns error for NaN', () => {
    expect(validateAngle(Number.NaN)).not.toBeNull()
  })
})
