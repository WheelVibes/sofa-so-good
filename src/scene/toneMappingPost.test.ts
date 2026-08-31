import { ToneMappingMode as PostToneMappingMode } from 'postprocessing'
import { describe, expect, it } from 'vitest'
import { TONE_MAPPING_MODES } from './look'
import { TONE_MAPPING_POST } from './toneMappingPost'
import { TONE_MAPPING_THREE } from './toneMappingThree'

describe('TONE_MAPPING_POST', () => {
  it('maps every look to the matching postprocessing operator', () => {
    expect(TONE_MAPPING_POST.filmic).toBe(PostToneMappingMode.ACES_FILMIC)
    expect(TONE_MAPPING_POST.agx).toBe(PostToneMappingMode.AGX)
    expect(TONE_MAPPING_POST.neutral).toBe(PostToneMappingMode.NEUTRAL)
  })

  it('covers every selectable tone-mapping mode', () => {
    // A missing entry resolves to `undefined`, which the ToneMapping effect
    // silently treats as mode 0 (LINEAR) — i.e. a wrong look with no error.
    for (const mode of TONE_MAPPING_MODES) {
      expect(TONE_MAPPING_POST[mode]).toBeTypeOf('number')
    }
  })

  it('stays in parity with the three-side map', () => {
    // The post stack and the direct-to-canvas path must offer the SAME set of
    // operators, or the look would change as the user crosses the tier boundary.
    expect(Object.keys(TONE_MAPPING_POST).sort()).toEqual(Object.keys(TONE_MAPPING_THREE).sort())
  })

  it('does not resolve any look to LINEAR (no view transform)', () => {
    // LINEAR is a clamp, not a view transform — resolving to it would reproduce
    // the untone-mapped, ~32%-clipped post-tier render this map exists to fix.
    for (const mode of TONE_MAPPING_MODES) {
      expect(TONE_MAPPING_POST[mode]).not.toBe(PostToneMappingMode.LINEAR)
    }
  })
})
