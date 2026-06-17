import { describe, expect, it } from 'vitest'
import { APP_VERSION, isNewerVersion, parseVersion } from './version'

describe('app version', () => {
  it('is a 4-part major.minor.patch.build string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  })

  it('starts on the 0.x line (major stays 0 until explicitly bumped)', () => {
    expect(parseVersion(APP_VERSION).major).toBe(0)
  })

  it('parses each part', () => {
    expect(parseVersion('1.2.3.4')).toEqual({ major: 1, minor: 2, patch: 3, build: 4 })
    expect(parseVersion('0.1')).toEqual({ major: 0, minor: 1, patch: 0, build: 0 })
  })

  it('compares newer field-by-field with build as the least significant part', () => {
    expect(isNewerVersion('0.1.0.1', '0.1.0.0')).toBe(true)
    expect(isNewerVersion('0.2.0.0', '0.1.9.9')).toBe(true)
    expect(isNewerVersion('0.1.0.0', '0.1.0.0')).toBe(false)
    expect(isNewerVersion('0.1.0.0', '0.1.0.1')).toBe(false)
    expect(isNewerVersion('1.0.0.0', '0.9.9.9')).toBe(true)
  })
})
