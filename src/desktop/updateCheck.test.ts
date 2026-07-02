import { describe, expect, it } from 'vitest'
import { decideDesktopUpdate, releaseTagToVersion } from './updateCheck'

describe('releaseTagToVersion', () => {
  it('accepts v-prefixed and bare tags, 2–4 parts', () => {
    expect(releaseTagToVersion('v0.9.1.0')).toBe('0.9.1.0')
    expect(releaseTagToVersion('0.9.1')).toBe('0.9.1')
    expect(releaseTagToVersion('v1.0')).toBe('1.0')
    expect(releaseTagToVersion(' v2.3.4 ')).toBe('2.3.4')
  })

  it('rejects non-version tags and non-strings', () => {
    expect(releaseTagToVersion('latest')).toBeNull()
    expect(releaseTagToVersion('v1.2.3-beta.1')).toBeNull()
    expect(releaseTagToVersion('')).toBeNull()
    expect(releaseTagToVersion(undefined)).toBeNull()
    expect(releaseTagToVersion(123)).toBeNull()
  })
})

describe('decideDesktopUpdate', () => {
  it('flags a newer release as an update', () => {
    expect(decideDesktopUpdate('v0.9.2.0', '0.9.1.0')).toEqual({
      status: 'update',
      version: '0.9.2.0',
    })
    // 3-part tag vs 4-part running build: missing build part counts as 0.
    expect(decideDesktopUpdate('v0.10.0', '0.9.1.7')).toEqual({
      status: 'update',
      version: '0.10.0',
    })
  })

  it('treats same or older releases as up to date', () => {
    expect(decideDesktopUpdate('v0.9.1.0', '0.9.1.0')).toEqual({ status: 'uptodate' })
    expect(decideDesktopUpdate('v0.9.0.9', '0.9.1.0')).toEqual({ status: 'uptodate' })
  })

  it('reports unparseable tags as errors', () => {
    expect(decideDesktopUpdate('latest', '0.9.1.0')).toEqual({ status: 'error' })
    expect(decideDesktopUpdate(undefined, '0.9.1.0')).toEqual({ status: 'error' })
  })
})
