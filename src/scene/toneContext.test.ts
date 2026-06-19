import { describe, expect, it } from 'vitest'
import { DEFAULT_TONE_MAPPING } from './look'
import {
  AUTO_FINISH_PREVIEW_MODE,
  AUTO_PHOTO_MODE,
  DEFAULT_TONE_MAPPING_SETTING,
  isAuto,
  resolveToneMapping,
  TONE_MAPPING_SETTINGS,
} from './toneContext'

const NO_CONTEXT = { finishPreview: false, photoMode: false }

describe('context-aware tone mapping (RD-404)', () => {
  it('defaults the user setting to auto and lists it first', () => {
    expect(DEFAULT_TONE_MAPPING_SETTING).toBe('auto')
    expect(TONE_MAPPING_SETTINGS[0]).toBe('auto')
    // auto + the three concrete operators, no duplicates
    expect(new Set(TONE_MAPPING_SETTINGS).size).toBe(TONE_MAPPING_SETTINGS.length)
    expect(TONE_MAPPING_SETTINGS).toEqual(
      expect.arrayContaining(['auto', 'filmic', 'agx', 'neutral']),
    )
  })

  it('auto → Neutral while previewing finishes (accurate product colour)', () => {
    expect(resolveToneMapping('auto', { finishPreview: true, photoMode: false })).toBe('neutral')
    expect(AUTO_FINISH_PREVIEW_MODE).toBe('neutral')
  })

  it('auto → AgX for photo/render presets', () => {
    expect(resolveToneMapping('auto', { finishPreview: false, photoMode: true })).toBe('agx')
    expect(AUTO_PHOTO_MODE).toBe('agx')
  })

  it('auto → historical filmic default with no active context', () => {
    expect(resolveToneMapping('auto', NO_CONTEXT)).toBe(DEFAULT_TONE_MAPPING)
    expect(resolveToneMapping('auto', NO_CONTEXT)).toBe('filmic')
  })

  it('finish preview wins over photo mode (judging colour mid-preset)', () => {
    expect(resolveToneMapping('auto', { finishPreview: true, photoMode: true })).toBe('neutral')
  })

  it('an explicit user pick always wins over context (override)', () => {
    // Pick filmic while previewing finishes → still filmic, not Neutral.
    expect(resolveToneMapping('filmic', { finishPreview: true, photoMode: false })).toBe('filmic')
    // Pick neutral for a photo preset → still neutral, not AgX.
    expect(resolveToneMapping('neutral', { finishPreview: false, photoMode: true })).toBe('neutral')
    // Pick agx with no context → agx.
    expect(resolveToneMapping('agx', NO_CONTEXT)).toBe('agx')
  })

  it('isAuto distinguishes the auto sentinel from explicit picks', () => {
    expect(isAuto('auto')).toBe(true)
    expect(isAuto('filmic')).toBe(false)
    expect(isAuto('agx')).toBe(false)
    expect(isAuto('neutral')).toBe(false)
  })
})
