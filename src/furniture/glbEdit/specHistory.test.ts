import { describe, expect, it } from 'vitest'
import { type AssetEditSpec, addPart, createEmptySpec } from './editSpec'
import {
  COALESCE_MS,
  canRedo,
  canUndo,
  createSpecHistory,
  currentSpec,
  HISTORY_LIMIT,
  pushSpec,
  redo,
  undo,
} from './specHistory'

/** A spec with `n` distinct parts (each push is a real, different snapshot). */
function specWithParts(n: number): AssetEditSpec {
  let s = createEmptySpec()
  for (let i = 0; i < n; i++) s = addPart(s, 'box')
  return s
}

describe('specHistory', () => {
  it('starts with one entry and nothing to undo/redo', () => {
    const h = createSpecHistory(createEmptySpec(), 0)
    expect(currentSpec(h).parts).toHaveLength(0)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('push then undo/redo walks the timeline', () => {
    const a = createEmptySpec()
    const b = specWithParts(1)
    const c = specWithParts(2)
    let h = createSpecHistory(a, 0)
    h = pushSpec(h, b, { now: 1000 })
    h = pushSpec(h, c, { now: 2000 })
    expect(currentSpec(h)).toBe(c)
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)

    h = undo(h)
    expect(currentSpec(h)).toBe(b)
    h = undo(h)
    expect(currentSpec(h)).toBe(a)
    expect(canUndo(h)).toBe(false)

    h = redo(h)
    expect(currentSpec(h)).toBe(b)
    h = redo(h)
    expect(currentSpec(h)).toBe(c)
    expect(canRedo(h)).toBe(false)
  })

  it('undo/redo are no-ops at the ends', () => {
    const h = createSpecHistory(createEmptySpec(), 0)
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('pushing after an undo truncates the redo future', () => {
    const a = createEmptySpec()
    const b = specWithParts(1)
    const c = specWithParts(2)
    const d = specWithParts(3)
    let h = createSpecHistory(a, 0)
    h = pushSpec(h, b, { now: 100 })
    h = pushSpec(h, c, { now: 200 })
    h = undo(h) // now at b, c is redoable
    expect(canRedo(h)).toBe(true)
    h = pushSpec(h, d, { now: 300 }) // forks — c is gone
    expect(currentSpec(h)).toBe(d)
    expect(canRedo(h)).toBe(false)
    h = undo(h)
    expect(currentSpec(h)).toBe(b)
  })

  it('coalesces same-key pushes within the window into one step', () => {
    const a = createEmptySpec()
    const b = specWithParts(1)
    const c = specWithParts(2)
    let h = createSpecHistory(a, 0)
    // Two rapid keyed pushes < COALESCE_MS apart merge into ONE entry.
    h = pushSpec(h, b, { coalesceKey: 'patch', now: 10 })
    h = pushSpec(h, c, { coalesceKey: 'patch', now: 10 + COALESCE_MS })
    expect(h.entries).toHaveLength(2) // seed + one merged edit
    expect(currentSpec(h)).toBe(c)
    // One undo jumps straight back past both coalesced edits.
    h = undo(h)
    expect(currentSpec(h)).toBe(a)
  })

  it('does not coalesce past the window, or across different keys', () => {
    const a = createEmptySpec()
    const b = specWithParts(1)
    const c = specWithParts(2)
    const d = specWithParts(3)
    let h = createSpecHistory(a, 0)
    h = pushSpec(h, b, { coalesceKey: 'patch', now: 0 })
    // Same key but past the window → new entry.
    h = pushSpec(h, c, { coalesceKey: 'patch', now: COALESCE_MS + 1 })
    // Different key within the window → new entry.
    h = pushSpec(h, d, { coalesceKey: 'other', now: COALESCE_MS + 1 })
    expect(h.entries).toHaveLength(4)
  })

  it('a structural push (no key) never coalesces', () => {
    const a = createEmptySpec()
    let h = createSpecHistory(a, 0)
    h = pushSpec(h, specWithParts(1), { now: 0 })
    h = pushSpec(h, specWithParts(2), { now: 1 })
    expect(h.entries).toHaveLength(3)
  })

  it('is bounded to HISTORY_LIMIT, dropping the oldest', () => {
    let h = createSpecHistory(createEmptySpec(), 0)
    // Push well past the limit; each push is a distinct (structural) step.
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) {
      h = pushSpec(h, specWithParts(i), { now: i })
    }
    expect(h.entries).toHaveLength(HISTORY_LIMIT)
    // The current (newest) entry survives; the index points at the tail.
    expect(h.index).toBe(HISTORY_LIMIT - 1)
    expect(currentSpec(h).parts).toHaveLength(HISTORY_LIMIT + 20)
  })
})
