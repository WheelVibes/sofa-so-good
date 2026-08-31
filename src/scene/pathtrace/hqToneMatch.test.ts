import { describe, expect, it } from 'vitest'
import { DEFAULT_TONE_MAPPING } from '../look'
import { AUTO_PHOTO_MODE, resolveToneMapping } from '../toneContext'
import { TONE_MAPPING_THREE } from '../toneMappingThree'

/**
 * HQ-TONE-MATCH — the HQ path-traced still must use the app's resolved view
 * transform, not its own. `hqRenderSession` hardcoded `ACESFilmicToneMapping`,
 * which contradicted BOTH the photo-mode policy and the shipped default, and
 * ignored an explicit user pick outright.
 */
describe('HQ still tone mapping (HQ-TONE-MATCH)', () => {
  it('resolves a photo context to AgX, never filmic', () => {
    const mode = resolveToneMapping('auto', { photoMode: true, finishPreview: false })
    expect(mode).toBe(AUTO_PHOTO_MODE)
    expect(mode).toBe('agx')
    // The regression: filmic is what the session used to hardcode.
    expect(mode).not.toBe('filmic')
  })

  it('honours an explicit user pick, which is the case the hardcode broke worst', () => {
    for (const pick of ['filmic', 'agx', 'neutral'] as const) {
      expect(resolveToneMapping(pick, { photoMode: true, finishPreview: false })).toBe(pick)
    }
  })

  it('agrees with the live default when no photo context is claimed', () => {
    expect(resolveToneMapping('auto', { photoMode: false, finishPreview: false })).toBe(
      DEFAULT_TONE_MAPPING,
    )
  })

  it('maps every resolvable mode to a real three constant', () => {
    // The still and the viewport go through THIS registry, so they cannot drift.
    for (const mode of ['filmic', 'agx', 'neutral'] as const) {
      expect(typeof TONE_MAPPING_THREE[mode]).toBe('number')
    }
    expect(TONE_MAPPING_THREE.agx).not.toBe(TONE_MAPPING_THREE.filmic)
  })
})
