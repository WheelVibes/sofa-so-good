import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the 3D asset designer (Asset Studio Stage 0). A pro-tier power
 * tool that needs the full-screen canvas — present in Pro, hidden in Simple (the
 * default). Prod-safe pure code (client-side geometry + the existing GLB export
 * path), default on. Tested in BOTH modes per the CLAUDE.md hard rule; the same
 * flag gates the dialog mount, the ⌘K `glb-designer` command (COMMAND_FLAGS) and
 * the catalog "Design" button.
 */
describe('glbDesigner feature flag', () => {
  it('is registered as a pro-tier feature, default on, prod-safe', () => {
    const def = FEATURE_FLAGS.glbDesigner
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').glbDesigner).toBe(true)
  })

  it('is forced OFF in Simple mode (default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').glbDesigner).toBe(false)
  })
})
