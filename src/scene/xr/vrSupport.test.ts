import { describe, expect, it } from 'vitest'
import { detectVrSupport } from './vrSupport'

describe('detectVrSupport', () => {
  it('false when navigator.xr is absent (headless/desktop Safari)', async () => {
    expect(await detectVrSupport({})).toBe(false)
  })
  it('reflects isSessionSupported', async () => {
    expect(await detectVrSupport({ xr: { isSessionSupported: async () => true } })).toBe(true)
    expect(await detectVrSupport({ xr: { isSessionSupported: async () => false } })).toBe(false)
  })
  it('false when the query throws (permissions policy)', async () => {
    expect(
      await detectVrSupport({
        xr: {
          isSessionSupported: async () => {
            throw new Error('blocked')
          },
        },
      }),
    ).toBe(false)
  })
})
