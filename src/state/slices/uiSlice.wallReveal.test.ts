// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { DEFAULT_WALL_REVEAL_STRENGTH } from '../../apartment/walls/wallRevealMath'
import { useStore } from '../store'

/**
 * WALL-REVEAL defaults.
 *
 * `wallRevealScope` was flipped `'exterior'` -> `'all'` (v0.34.1.15) because 'exterior' faded only
 * **9** walls against **24**, so the dollhouse showed a maze of solid interior partitions with the
 * rooms behind them hidden — and seeing into the whole plan is the point of that view.
 *
 * **Nothing guarded the previous default**, which is why this file exists: a default is exactly the
 * kind of value that gets reverted by a merge or a refactor with no test going red, and the only
 * symptom would be a dollhouse that quietly stopped opening up.
 */
describe('wall reveal defaults', () => {
  it('defaults the reveal scope to ALL, so interior partitions fade too', () => {
    expect(useStore.getState().wallRevealScope).toBe('all')
  })

  it('defaults the fade strength to the barely-an-outline floor', () => {
    // 0.95 -> a head-on opacity floor of 0.05 (WALL_TRANSLUCENT_MIN).
    expect(useStore.getState().wallRevealStrength).toBe(DEFAULT_WALL_REVEAL_STRENGTH)
  })

  it('still lets a user pick exterior-only', () => {
    // The setting is not retired — 'exterior' keeps partitions solid for reading the bare layout.
    useStore.getState().setWallRevealScope('exterior')
    expect(useStore.getState().wallRevealScope).toBe('exterior')
    useStore.getState().setWallRevealScope('all')
    expect(useStore.getState().wallRevealScope).toBe('all')
  })
})
