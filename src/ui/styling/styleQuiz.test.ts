import { describe, expect, it } from 'vitest'
import { STYLE_QUIZ, scoreQuiz } from './styleQuiz'
import { STYLE_PRESETS } from './styleTransfer'

const PRESET_IDS = new Set(STYLE_PRESETS.map((s) => s.id))

describe('STYLE_QUIZ data', () => {
  it('every option weights only real preset ids', () => {
    for (const q of STYLE_QUIZ) {
      expect(q.options.length, `${q.id} options`).toBeGreaterThanOrEqual(2)
      for (const opt of q.options) {
        const keys = Object.keys(opt.weights)
        expect(keys.length, `${q.id} "${opt.label}" has weights`).toBeGreaterThan(0)
        for (const id of keys) {
          expect(PRESET_IDS.has(id), `${q.id} "${opt.label}" → ${id}`).toBe(true)
          expect(opt.weights[id], `${id} weight > 0`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('question ids are unique', () => {
    const ids = STYLE_QUIZ.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scoreQuiz', () => {
  it('recommends the style that the answers most favour', () => {
    // Pick every "industrial-leaning" option (index 2 in each question).
    const answers = { palette: 2, materials: 2, vibe: 2, accent: 1 }
    expect(scoreQuiz(answers)).toBe('industrial')
  })

  it('recommends coastal for sea/blue answers', () => {
    const answers = { palette: 3, materials: 3, vibe: 3, accent: 2 }
    expect(scoreQuiz(answers)).toBe('coastal')
  })

  it('returns a valid preset id for empty answers (deterministic default)', () => {
    const id = scoreQuiz({})
    expect(PRESET_IDS.has(id)).toBe(true)
    expect(id).toBe(STYLE_PRESETS[0].id) // tie/zero → first preset
  })

  it('ignores out-of-range / unknown answers', () => {
    const id = scoreQuiz({ palette: 99, bogus: 0 })
    expect(PRESET_IDS.has(id)).toBe(true)
  })

  it('always returns a real preset id across many answer combos', () => {
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        const id = scoreQuiz({ palette: a, materials: b, vibe: a, accent: b })
        expect(PRESET_IDS.has(id)).toBe(true)
      }
    }
  })
})
