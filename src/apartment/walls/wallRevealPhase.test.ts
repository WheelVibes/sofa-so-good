import { describe, expect, it } from 'vitest'
import {
  REVEAL_FADE_ENTER,
  REVEAL_FADE_EXIT,
  REVEAL_TRANSPARENT_AT,
  type RevealPhase,
  revealPhase,
  revealStrength,
  revealTargetOpacityForFade,
} from './wallRevealMath'

/** Run a whole opacity series through the latch and report how many times it flipped. */
function flips(series: readonly number[], start: RevealPhase = 'opaque'): number {
  let phase = start
  let n = 0
  for (const v of series) {
    const next = revealPhase(phase, v)
    if (next !== phase) n++
    phase = next
  }
  return n
}

describe('revealPhase (WALL-REVEAL-HYSTERESIS)', () => {
  it('brackets REVEAL_TRANSPARENT_AT symmetrically by 0.02', () => {
    expect(REVEAL_TRANSPARENT_AT - REVEAL_FADE_ENTER).toBeCloseTo(0.01, 10)
    expect(REVEAL_FADE_EXIT - REVEAL_TRANSPARENT_AT).toBeCloseTo(0.01, 10)
    expect(REVEAL_FADE_EXIT - REVEAL_FADE_ENTER).toBeCloseTo(0.02, 10)
  })

  it('enters fading only below the enter threshold', () => {
    expect(revealPhase('opaque', 1)).toBe('opaque')
    expect(revealPhase('opaque', REVEAL_FADE_EXIT)).toBe('opaque')
    expect(revealPhase('opaque', REVEAL_TRANSPARENT_AT)).toBe('opaque') // the old flip point
    expect(revealPhase('opaque', REVEAL_FADE_ENTER)).toBe('opaque') // strictly below
    expect(revealPhase('opaque', REVEAL_FADE_ENTER - 1e-6)).toBe('fading')
  })

  it('returns to opaque only above the exit threshold', () => {
    expect(revealPhase('fading', 0)).toBe('fading')
    expect(revealPhase('fading', REVEAL_TRANSPARENT_AT)).toBe('fading')
    expect(revealPhase('fading', REVEAL_FADE_EXIT)).toBe('fading') // strictly above
    expect(revealPhase('fading', REVEAL_FADE_EXIT + 1e-6)).toBe('opaque')
    expect(revealPhase('fading', 1)).toBe('opaque')
  })

  it('a dither ACROSS the old single threshold flips once, not once per frame', () => {
    // Eight frames hovering either side of 0.985 — the shape of the strobe finding S3 named.
    const hover = [0.99, 0.982, 0.99, 0.981, 0.988, 0.983, 0.987, 0.984]
    let bare = 0
    let prev = false
    for (const v of hover) {
      const t = v < REVEAL_TRANSPARENT_AT
      if (t !== prev) bare++
      prev = t
    }
    expect(bare).toBe(7) // the unlatched comparison flips on every frame after the first
    expect(flips(hover)).toBe(0) // …the latch never leaves opaque: nothing cleared 0.975
  })

  it('a real fade down and back still flips exactly twice', () => {
    const down = [1, 0.995, 0.97, 0.8, 0.4, 0.05]
    const up = [0.4, 0.8, 0.97, 0.99, 0.998, 1]
    expect(flips([...down, ...up])).toBe(2)
  })

  it('a camera dithering about the fade ONSET cannot strobe the render state', () => {
    // The mechanism: the own-facing smoothstep is shallow just past REVEAL_ONSET, so a small
    // azimuth dither there lands the target either side of 0.985. Build that series for real.
    const fade = 0.95 // DEFAULT_WALL_REVEAL_STRENGTH
    const towards = [0.283, 0.288, 0.283, 0.288, 0.283, 0.288, 0.283, 0.288]
    const series = towards.map((t) => revealTargetOpacityForFade(fade, revealStrength(t)))
    expect(Math.min(...series)).toBeGreaterThan(0.97) // sanity: the wall is barely fading
    // The bare comparison flips on every frame of this series…
    let bare = 0
    let prev = series[0] < REVEAL_TRANSPARENT_AT
    for (const v of series.slice(1)) {
      const t = v < REVEAL_TRANSPARENT_AT
      if (t !== prev) bare++
      prev = t
    }
    expect(bare).toBe(series.length - 1)
    // …and the latch flips at most once over the whole dither.
    expect(flips(series)).toBeLessThanOrEqual(1)
  })
})
