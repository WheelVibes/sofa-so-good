import { describe, expect, it } from 'vitest'
import {
  louvreSlatCount,
  louvreSlatOffsets,
  verticalBarCount,
  verticalBarOffsets,
} from './windowGrilleLayout'

describe('windowGrilleLayout', () => {
  describe('verticalBarCount / verticalBarOffsets', () => {
    it('matches the inline Math.max(2, Math.round(width/pitch)) formula (grille pitch)', () => {
      for (const width of [0.6, 1.0, 1.3, 2.0, 2.8]) {
        expect(verticalBarCount(width, 0.16)).toBe(Math.max(2, Math.round(width / 0.16)))
      }
    })

    it('emits n-1 interior bars for a grille-pitch window, symmetric about 0', () => {
      const width = 1.3
      const n = verticalBarCount(width, 0.16)
      const offsets = verticalBarOffsets(width, 0.16)
      expect(offsets).toHaveLength(n - 1)
      // Symmetric: reversing + negating reproduces the same set.
      const mirrored = offsets.map((z) => -z).reverse()
      offsets.forEach((z, i) => {
        expect(mirrored[i]).toBeCloseTo(z, 12)
      })
      offsets.forEach((z) => {
        expect(z).toBeGreaterThan(-width / 2)
      })
      offsets.forEach((z) => {
        expect(z).toBeLessThan(width / 2)
      })
    })

    it('uses the denser invisible-grille pitch (~10 cm) — more cables than the visible grille', () => {
      const width = 1.3
      const grilleBars = verticalBarOffsets(width, 0.16)
      const cables = verticalBarOffsets(width, 0.1)
      expect(cables.length).toBeGreaterThan(grilleBars.length)
      // Exact count for this width: n = round(1.3/0.1) = 13 → 12 interior cables.
      expect(cables).toHaveLength(12)
    })

    it('floors the bar count at `min` for a narrow window (never fewer than 2 bays)', () => {
      expect(verticalBarCount(0.05, 0.16)).toBe(2)
      expect(verticalBarOffsets(0.05, 0.16)).toHaveLength(1)
    })
  })

  describe('louvreSlatCount / louvreSlatOffsets', () => {
    it('matches the inline Math.max(3, Math.round(height/pitch)) formula', () => {
      for (const height of [0.5, 1.0, 1.5, 2.3]) {
        expect(louvreSlatCount(height, 0.14)).toBe(Math.max(3, Math.round(height / 0.14)))
      }
    })

    it('emits n slats (every band gets one, unlike the vertical bars), centred per band', () => {
      const height = 1.5
      const n = louvreSlatCount(height, 0.14)
      const offsets = louvreSlatOffsets(height, 0.14)
      expect(offsets).toHaveLength(n)
      const pitch = height / n
      expect(offsets[0]).toBeCloseTo(-height / 2 + pitch / 2, 12)
      expect(offsets[n - 1]).toBeCloseTo(height / 2 - pitch / 2, 12)
    })

    it('floors the slat count at 3 for a short window', () => {
      expect(louvreSlatCount(0.1, 0.14)).toBe(3)
      expect(louvreSlatOffsets(0.1, 0.14)).toHaveLength(3)
    })
  })
})
