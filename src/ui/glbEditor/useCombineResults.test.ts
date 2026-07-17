import { describe, expect, it } from 'vitest'
import { reconcileGroupSignatures } from './useCombineResults'

/**
 * Pure reconciliation helper for the combine-results hook: prunes signature
 * bookkeeping for groups that vanished and reports which live groups changed.
 * The React wiring is exercised by the designer scenarios; this covers the
 * decision that a stale sigRef entry can't survive a group being removed (the
 * bug: an ungroup-then-undo left the old signature behind so the restored group
 * — same id — never re-evaluated).
 */
describe('reconcileGroupSignatures', () => {
  it('marks a brand-new group (no prior signature) stale', () => {
    const { stale, nextSig } = reconcileGroupSignatures([{ id: 'g1', sig: 'a' }], new Map())
    expect(stale).toEqual(['g1'])
    expect(nextSig.get('g1')).toBeUndefined() // set only after a successful eval
  })

  it('skips a group whose signature is unchanged', () => {
    const { stale } = reconcileGroupSignatures([{ id: 'g1', sig: 'a' }], new Map([['g1', 'a']]))
    expect(stale).toEqual([])
  })

  it('re-marks a group whose signature changed', () => {
    const { stale, nextSig } = reconcileGroupSignatures(
      [{ id: 'g1', sig: 'b' }],
      new Map([['g1', 'a']]),
    )
    expect(stale).toEqual(['g1'])
    expect(nextSig.get('g1')).toBe('a') // pruned map keeps the old value until re-eval
  })

  it('prunes the signature of a group that no longer exists (no leak)', () => {
    const { nextSig } = reconcileGroupSignatures(
      [{ id: 'g1', sig: 'a' }],
      new Map([
        ['g1', 'a'],
        ['gone', 'x'],
      ]),
    )
    expect(nextSig.has('gone')).toBe(false)
    expect(nextSig.has('g1')).toBe(true)
  })

  it('re-evaluates a same-id group restored after its signature was pruned (undo case)', () => {
    // Group g1 was removed (pruned to an empty map), then undo brings it back
    // with the SAME id + signature. Because the prior signature was pruned, it
    // is now stale again → re-evaluated (previously it was masked as unchanged).
    const { stale } = reconcileGroupSignatures([{ id: 'g1', sig: 'a' }], new Map())
    expect(stale).toEqual(['g1'])
  })
})
