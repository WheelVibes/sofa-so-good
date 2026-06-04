import { describe, expect, it } from 'vitest'
import { downscaleImageFile, fitDimensions } from './thumbnail'

describe('fitDimensions', () => {
  it('scales the longest edge down to maxEdge, preserving aspect', () => {
    expect(fitDimensions(1000, 500, 256)).toEqual({ w: 256, h: 128 })
    expect(fitDimensions(400, 800, 256)).toEqual({ w: 128, h: 256 })
  })
  it('never upscales a small image', () => {
    expect(fitDimensions(100, 80, 256)).toEqual({ w: 100, h: 80 })
  })
  it('handles a square image', () => {
    expect(fitDimensions(512, 512, 256)).toEqual({ w: 256, h: 256 })
  })
})

describe('downscaleImageFile (best-effort)', () => {
  // In a non-browser / degraded image env (jsdom, happy-dom) the canvas image
  // pipeline can't run — happy-dom even exposes createImageBitmap as a function
  // that THROWS when called. The contract is best-effort: never throw, fall
  // back to the original file so callers still get a storable blob.
  it('falls back to the original file instead of throwing', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'x.jpg', { type: 'image/jpeg' })
    const out = await downscaleImageFile(file, 256)
    expect(out).toBe(file)
  })
})
