import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * R4-4 — electrical socket-count & DB-load advisory. This is a pure client-side
 * ADVISORY over the existing MEP electrical points; it introduces NO new feature
 * flag, instead riding the two already-gated surfaces it appears on:
 *   - the MEP editor layer (`mepEditor` flag), and
 *   - the electrical plan sheet in the drawing set (`electricalPlan` flag).
 * Both are analytical/professional contractor surfaces, so both are pro-tier —
 * hidden in Simple mode, present in Pro. This test documents (and guards) that
 * reused gating in BOTH modes.
 */
describe('socket advisory (R4-4) reuses existing pro-tier gating', () => {
  it('mepEditor is a pro-tier flag, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.mepEditor
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('electricalPlan is a pro-tier flag, default on, not devOnly', () => {
    const def = FEATURE_FLAGS.electricalPlan
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('both surfaces are OFF in Simple mode', () => {
    const simple = resolveFlags(false, {}, false, 'simple')
    expect(simple.mepEditor).toBe(false)
    expect(simple.electricalPlan).toBe(false)
  })

  it('both surfaces are ON in Pro mode', () => {
    const pro = resolveFlags(false, {}, false, 'pro')
    expect(pro.mepEditor).toBe(true)
    expect(pro.electricalPlan).toBe(true)
  })
})
