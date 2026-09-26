import { describe, expect, it } from 'vitest'
import {
  emptyPool,
  POOL_FADE_OUT_S,
  POOL_FADE_S,
  type PoolState,
  poolFading,
  stepPool,
} from './lightPool'

const set = (...ids: string[]) => new Set(ids)
const ids = (s: PoolState) => s.slots.map((x) => x.lightId)
const weightOf = (s: PoolState, id: string) => s.slots.find((x) => x.lightId === id)?.weight ?? 0

/** Run the pool for `seconds` at 60 Hz toward a fixed target. */
function run(s: PoolState, wanted: string[], cand: Set<string>, seconds: number, instant = false) {
  let out = s
  for (let t = 0; t < seconds; t += 1 / 60) out = stepPool(out, wanted, cand, 1 / 60, instant)
  return out
}

describe('lightPool — constant slots, stable assignment, faded room changes', () => {
  it('always has exactly the configured number of slots', () => {
    const s = stepPool(emptyPool(8), ['a', 'b'], set('a', 'b'), 1 / 60, false)
    expect(s.slots).toHaveLength(8)
    expect(ids(s).filter(Boolean)).toEqual(['a', 'b'])
  })

  it('the first frame and the lights switch are instant — exactly as before the pool', () => {
    const on = stepPool(emptyPool(4), ['a', 'b'], set('a', 'b'), 1 / 60, false)
    expect(weightOf(on, 'a')).toBe(1)
    expect(poolFading(on)).toBe(false)
    const off = stepPool(on, [], set(), 1 / 60, false)
    expect(ids(off)).toEqual([null, null, null, null])
  })

  it('a lamp switched off by its own switch leaves at once, the others keep their slots', () => {
    const s0 = stepPool(emptyPool(4), ['a', 'b', 'c'], set('a', 'b', 'c'), 1 / 60, false)
    const s1 = stepPool(s0, ['a', 'c'], set('a', 'c'), 1 / 60, false)
    expect(ids(s1)).toEqual(['a', null, 'c', null])
    expect(weightOf(s1, 'c')).toBe(1)
  })

  it('a room change fades: the leaving light out, the entering light in, over POOL_FADE_S', () => {
    const cand = set('a', 'b', 'c')
    const s0 = stepPool(emptyPool(2), ['a', 'b'], cand, 1 / 60, false)
    // Camera crosses into a room where c is visible and a is not.
    const s1 = stepPool(s0, ['b', 'c'], cand, 1 / 60, false)
    expect(weightOf(s1, 'a')).toBeLessThan(1)
    expect(weightOf(s1, 'a')).toBeGreaterThan(0)
    expect(weightOf(s1, 'b')).toBe(1) // stays, keeps its slot, untouched
    expect(s1.slots[1].lightId).toBe('b')
    expect(poolFading(s1)).toBe(true)
    // The pool is full, so c waits for a's slot rather than evicting anyone.
    expect(ids(s1)).not.toContain('c')
    const s2 = run(s1, ['b', 'c'], cand, POOL_FADE_S * 2 + 0.05)
    expect(ids(s2)).toEqual(['c', 'b'])
    expect(weightOf(s2, 'c')).toBe(1)
    expect(poolFading(s2)).toBe(false)
  })

  it('an entering light takes a free slot straight away and ramps up, never jumping', () => {
    const cand = set('a', 'b')
    const s0 = stepPool(emptyPool(4), ['a'], cand, 1 / 60, false)
    const s1 = stepPool(s0, ['a', 'b'], cand, 1 / 60, false)
    const w1 = weightOf(s1, 'b')
    expect(w1).toBeGreaterThan(0)
    expect(w1).toBeLessThanOrEqual(1 / 60 / POOL_FADE_S + 1e-9)
    const s2 = run(s1, ['a', 'b'], cand, POOL_FADE_S)
    expect(weightOf(s2, 'b')).toBe(1)
  })

  it('walking back before a fade finishes reverses it from where it was', () => {
    const cand = set('a', 'b')
    const s0 = stepPool(emptyPool(2), ['a'], cand, 1 / 60, false)
    const s1 = run(s0, [], cand, POOL_FADE_OUT_S / 2)
    const mid = weightOf(s1, 'a')
    expect(mid).toBeGreaterThan(0.3)
    expect(mid).toBeLessThan(0.7)
    const s2 = stepPool(s1, ['a'], cand, 1 / 60, false)
    expect(weightOf(s2, 'a')).toBeGreaterThan(mid)
  })

  it('reduced motion makes a room change instant', () => {
    const cand = set('a', 'b')
    const s0 = stepPool(emptyPool(1), ['a'], cand, 1 / 60, true)
    const s1 = stepPool(s0, ['b'], cand, 1 / 60, true)
    expect(ids(s1)).toEqual(['b'])
    expect(weightOf(s1, 'b')).toBe(1)
    expect(poolFading(s1)).toBe(false)
  })

  it('does not mutate its input', () => {
    const s0 = stepPool(emptyPool(2), ['a'], set('a', 'b'), 1 / 60, false)
    const snapshot = JSON.stringify(s0.slots)
    stepPool(s0, ['b'], set('a', 'b'), 1 / 60, false)
    expect(JSON.stringify(s0.slots)).toBe(snapshot)
  })
})
