import { describe, expect, it } from 'vitest'
import { classifyProbePixels, HqBlankRenderError, isHqBlankRenderError } from './hqBlankProbe'

/** Build an RGBA byte buffer from [r,g,b,a] pixel tuples. */
function rgba(...pixels: Array<[number, number, number, number]>): Uint8Array {
  return new Uint8Array(pixels.flat())
}

describe('classifyProbePixels (PT-BLANK-GUARD)', () => {
  it('flags an all-black readback as blank (failed megakernel, plain blit)', () => {
    expect(classifyProbePixels(rgba([0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]))).toBe('blank')
  })

  it('flags an all-white readback as blank (failed megakernel, denoise blit)', () => {
    expect(classifyProbePixels(rgba([255, 255, 255, 255], [255, 255, 255, 255]))).toBe('blank')
  })

  it('ignores alpha — uniform RGB extremes are blank regardless of alpha', () => {
    expect(classifyProbePixels(rgba([0, 0, 0, 0], [0, 0, 0, 128]))).toBe('blank')
    expect(classifyProbePixels(rgba([255, 255, 255, 0], [255, 255, 255, 7]))).toBe('blank')
  })

  it('passes a normal render — mixed mid-range pixels are ok (no abort)', () => {
    expect(
      classifyProbePixels(rgba([191, 212, 230, 255], [90, 86, 80, 255], [12, 40, 200, 255])),
    ).toBe('ok')
  })

  it('passes when even ONE channel is non-extreme among otherwise black pixels', () => {
    expect(classifyProbePixels(rgba([0, 0, 0, 255], [0, 1, 0, 255], [0, 0, 0, 255]))).toBe('ok')
  })

  it('passes a pure black-and-white mix (not uniformly one extreme)', () => {
    // A real high-contrast frame: neither "all 0" nor "all 255" → healthy.
    expect(classifyProbePixels(rgba([0, 0, 0, 255], [255, 255, 255, 255]))).toBe('ok')
  })

  it('passes near-extremes — 1 and 254 are real signal, not blank', () => {
    expect(classifyProbePixels(rgba([1, 1, 1, 255], [1, 1, 1, 255]))).toBe('ok')
    expect(classifyProbePixels(rgba([254, 254, 254, 255], [254, 254, 254, 255]))).toBe('ok')
  })

  it('treats an empty/failed readback as ok — never aborts on missing evidence', () => {
    expect(classifyProbePixels(new Uint8Array(0))).toBe('ok')
    expect(classifyProbePixels([])).toBe('ok')
  })

  it('ignores a trailing partial pixel (fewer than 4 bytes)', () => {
    // 1 full black pixel + 3 stray bytes → still classified on the full pixel.
    expect(classifyProbePixels(new Uint8Array([0, 0, 0, 255, 9, 9, 9]))).toBe('blank')
  })

  it('handles a plain array input (ArrayLike contract)', () => {
    expect(classifyProbePixels([0, 0, 0, 255, 0, 0, 0, 255])).toBe('blank')
  })
})

describe('isHqBlankRenderError', () => {
  it('recognises the blank-render abort error', () => {
    expect(isHqBlankRenderError(new HqBlankRenderError())).toBe(true)
  })

  it('recognises the marker across module duplication (no instanceof reliance)', () => {
    expect(isHqBlankRenderError({ hqBlankRender: true })).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isHqBlankRenderError(new Error('shader failed'))).toBe(false)
    expect(isHqBlankRenderError(null)).toBe(false)
    expect(isHqBlankRenderError(undefined)).toBe(false)
    expect(isHqBlankRenderError('blank')).toBe(false)
    expect(isHqBlankRenderError({ hqBlankRender: 'yes' })).toBe(false)
  })
})
