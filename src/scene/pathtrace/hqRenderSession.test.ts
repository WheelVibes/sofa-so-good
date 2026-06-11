import { describe, expect, it } from 'vitest'
import { clampHqOptions } from './hqRenderSession'

describe('clampHqOptions', () => {
  it('clamps dimensions and samples to GPU-safe bounds', () => {
    expect(clampHqOptions({ width: 99999, height: 0, maxSamples: 1e9 })).toEqual({
      width: 4096,
      height: 64,
      maxSamples: 4096,
    })
    expect(clampHqOptions({ width: 1920, height: 1080, maxSamples: 256 })).toEqual({
      width: 1920,
      height: 1080,
      maxSamples: 256,
    })
    expect(clampHqOptions({ width: Number.NaN, height: -5, maxSamples: 0 })).toEqual({
      width: 64,
      height: 64,
      maxSamples: 1,
    })
  })
})
