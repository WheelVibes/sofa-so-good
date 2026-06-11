import { describe, expect, it } from 'vitest'
import { shouldAutoAdvance, wrapIndex } from './slideLogic'

describe('presentation slide logic', () => {
  describe('wrapIndex', () => {
    it('wraps forward past the end', () => {
      expect(wrapIndex(3, 3)).toBe(0)
      expect(wrapIndex(4, 3)).toBe(1)
    })
    it('wraps backward past the start', () => {
      expect(wrapIndex(-1, 3)).toBe(2)
    })
    it('passes in-range indices through', () => {
      expect(wrapIndex(1, 3)).toBe(1)
    })
    it('is safe on an empty deck', () => {
      expect(wrapIndex(5, 0)).toBe(0)
      expect(wrapIndex(-1, 0)).toBe(0)
    })
  })

  describe('shouldAutoAdvance', () => {
    const base = { presenting: true, auto: true, count: 3, isPanoSlide: false }
    it('runs on a regular slide while presenting with auto on', () => {
      expect(shouldAutoAdvance(base)).toBe(true)
    })
    it('pauses on a 360° slide (interactive — advance on tap/next only)', () => {
      expect(shouldAutoAdvance({ ...base, isPanoSlide: true })).toBe(false)
    })
    it('never runs when not presenting / auto off / no slides', () => {
      expect(shouldAutoAdvance({ ...base, presenting: false })).toBe(false)
      expect(shouldAutoAdvance({ ...base, auto: false })).toBe(false)
      expect(shouldAutoAdvance({ ...base, count: 0 })).toBe(false)
    })
  })
})
