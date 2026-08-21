import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS } from './registry'
import { resolveFlags } from './resolve'

/**
 * Flag gating for the geometry-only professional 3D formats (OBJ / STL).
 *
 * Split out of the simple-tier `sceneExport3d` in UIUX-71: a Simple-mode audit
 * found the File menu offering a casual HDB owner "Geometry-only Wavefront OBJ"
 * and "Geometry-only STL for 3D printing / CAD" — professional interchange
 * formats, which the tier rule puts in Pro (alongside `dxfExport`). The
 * consumer-facing formats (GLB, USDZ/AR) stay on `sceneExport3d` in Simple.
 * Tested in BOTH modes per CLAUDE.md.
 */
describe('sceneExportCad feature flag', () => {
  it('is registered as a pro-tier feature, default on', () => {
    const def = FEATURE_FLAGS.sceneExportCad
    expect(def).toBeDefined()
    expect(def.tier).toBe('pro')
    expect(def.default).toBe(true)
    expect(def.devOnly).toBeUndefined()
  })

  it('is OFF in Simple mode (the default experience stays minimal)', () => {
    expect(resolveFlags(false, {}, false, 'simple').sceneExportCad).toBe(false)
  })

  it('is ON in Pro mode', () => {
    expect(resolveFlags(false, {}, false, 'pro').sceneExportCad).toBe(true)
  })

  it('leaves the consumer-facing sceneExport3d on in BOTH modes', () => {
    expect(FEATURE_FLAGS.sceneExport3d.tier).toBe('simple')
    expect(resolveFlags(false, {}, false, 'simple').sceneExport3d).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').sceneExport3d).toBe(true)
  })
})
