import { describe, expect, it } from 'vitest'
import { battenCount, battenOffset, battenStep, pitchedCount, pitchedOffsets } from './slatLayout'

describe('slatLayout', () => {
  describe('battenCount', () => {
    it('matches the inline Math.max(1, Math.round(...)) formula', () => {
      // RoomDivider slat default: innerW = 1.6 - 0.1 = 1.5, battenW 0.035, gap 0.075.
      const span = 1.5
      const battenW = 0.035
      const gap = 0.075
      const expected = Math.max(1, Math.round((span - battenW) / (battenW + gap)))
      expect(battenCount(span, battenW, gap)).toBe(expected)
    })

    it('never drops below 1 for a tiny span', () => {
      expect(battenCount(0.04, 0.035, 0.075)).toBe(1)
      expect(battenCount(0, 0.035, 0.075)).toBe(1)
    })
  })

  describe('battenStep + battenOffset', () => {
    it('reproduces the -span/2 + battenW/2 + i*step centres exactly', () => {
      const span = 1.5
      const battenW = 0.035
      const n = battenCount(span, battenW, 0.075)
      const step = battenStep(span, battenW, n)
      for (let i = 0; i < n; i++) {
        const inline = -span / 2 + battenW / 2 + i * step
        expect(battenOffset(span, battenW, step, i)).toBeCloseTo(inline, 12)
      }
    })

    it('first and last battens sit battenW/2 inside the span ends', () => {
      const span = 1.5
      const battenW = 0.035
      const n = battenCount(span, battenW, 0.075)
      const step = battenStep(span, battenW, n)
      expect(battenOffset(span, battenW, step, 0)).toBeCloseTo(-span / 2 + battenW / 2, 12)
      expect(battenOffset(span, battenW, step, n - 1)).toBeCloseTo(span / 2 - battenW / 2, 12)
    })

    it('step is 0 for a single batten (and 0 count)', () => {
      expect(battenStep(0.04, 0.035, 1)).toBe(0)
      expect(battenStep(1.0, 0.035, 0)).toBe(0)
      // A single batten is centred.
      expect(battenOffset(0.04, 0.035, 0, 0)).toBeCloseTo(-0.04 / 2 + 0.035 / 2, 12)
    })
  })

  describe('pitchedCount + pitchedOffsets', () => {
    it('matches the feature-wall Math.max(min, Math.round(width/pitch)) formula', () => {
      // FeatureWall slat: pitch 0.09, min 6.
      expect(pitchedCount(1.8, 0.09, 6)).toBe(Math.max(6, Math.round(1.8 / 0.09)))
      // Narrow panel floors at the minimum.
      expect(pitchedCount(0.3, 0.09, 6)).toBe(6)
      // Wide panel scales up.
      expect(pitchedCount(3.0, 0.09, 6)).toBe(Math.round(3.0 / 0.09))
    })

    it('reproduces the -width/2 + step/2 + i*step batten centres exactly', () => {
      const width = 1.8
      const n = pitchedCount(width, 0.09, 6)
      const step = width / n
      const offsets = pitchedOffsets(width, n)
      expect(offsets).toHaveLength(n)
      offsets.forEach((x, i) => {
        expect(x).toBeCloseTo(-width / 2 + step / 2 + i * step, 12)
      })
    })

    it('battens are symmetric about the panel centre', () => {
      const width = 1.8
      const n = pitchedCount(width, 0.09, 6)
      const offsets = pitchedOffsets(width, n)
      for (let i = 0; i < n; i++) {
        expect(offsets[i]).toBeCloseTo(-offsets[n - 1 - i], 12)
      }
    })
  })
})
