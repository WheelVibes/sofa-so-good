import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for FEAT-A (frame/zoom-to-selection camera). A universal 3D-tool
 * navigation convenience (SketchUp/Blender/Figma "zoom to selection"), same
 * shape as `minimapTeleport` — a core-loop nav aid, so simple tier, present in
 * BOTH Simple and Pro.
 */
describe('frameSelection feature flag', () => {
  it('is registered as a simple-tier feature, default on, no devOnly', () => {
    const def = FEATURE_FLAGS.frameSelection
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is ON in Simple mode (the default experience)', () => {
    expect(resolveFlags(false, {}, false, 'simple').frameSelection).toBe(true)
  })

  it('is ON in Pro mode too', () => {
    expect(resolveFlags(false, {}, false, 'pro').frameSelection).toBe(true)
  })
})
