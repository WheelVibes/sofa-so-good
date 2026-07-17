// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PREVIEW_ENV,
  isPreviewEnv,
  loadPreviewEnv,
  PREVIEW_ENVS,
  savePreviewEnv,
} from './previewEnvPref'

describe('previewEnvPref', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to the studio rig', () => {
    expect(loadPreviewEnv()).toBe('studio')
    expect(DEFAULT_PREVIEW_ENV).toBe('studio')
    expect(PREVIEW_ENVS).toEqual(['studio', 'room'])
  })

  it('round-trips a saved preference', () => {
    savePreviewEnv('room')
    expect(loadPreviewEnv()).toBe('room')
    savePreviewEnv('studio')
    expect(loadPreviewEnv()).toBe('studio')
  })

  it('falls back to the default for a garbage stored value', () => {
    localStorage.setItem('hdb_designer_preview_env', 'holodeck')
    expect(loadPreviewEnv()).toBe('studio')
  })

  it('guards the value with a type predicate', () => {
    expect(isPreviewEnv('studio')).toBe(true)
    expect(isPreviewEnv('room')).toBe(true)
    expect(isPreviewEnv('void')).toBe(false)
  })
})
