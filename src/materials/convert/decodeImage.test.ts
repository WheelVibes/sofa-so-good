import { describe, expect, it } from 'vitest'
import { EXTRA_TEXTURE_EXTENSIONS, isSupportedTexture } from './decodeImage'

// Pixel decode + WebP re-encode need OffscreenCanvas/createImageBitmap/three
// loaders, which jsdom lacks — those paths are covered by the Task 10 visual
// verification. Here we lock down the format-acceptance gate (pure logic).
describe('isSupportedTexture', () => {
  it('accepts native + extra formats, rejects unknown', () => {
    expect(isSupportedTexture('a.png')).toBe(true)
    expect(isSupportedTexture('A.JPG')).toBe(true)
    expect(isSupportedTexture('a.webp')).toBe(true)
    expect(isSupportedTexture('a.bmp')).toBe(true)
    for (const e of EXTRA_TEXTURE_EXTENSIONS) expect(isSupportedTexture(`a${e}`)).toBe(true)
    expect(isSupportedTexture('a.txt')).toBe(false)
    expect(isSupportedTexture('a.glb')).toBe(false)
    expect(isSupportedTexture('noext')).toBe(false)
  })
})
