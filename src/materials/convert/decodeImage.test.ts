import { describe, expect, it } from 'vitest'
import {
  assertDecodable,
  EXTRA_TEXTURE_EXTENSIONS,
  isSupportedTexture,
  MAX_DECODE_DIM,
  readImageHeaderDims,
} from './decodeImage'

/** Build a minimal PNG buffer with the given IHDR dimensions. */
function pngHeader(width: number, height: number): ArrayBuffer {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const dv = new DataView(b.buffer)
  dv.setUint32(16, width)
  dv.setUint32(20, height)
  return b.buffer
}

/** Build a minimal JPEG buffer: SOI, an APP0 segment, then an SOF0 with size. */
function jpegHeader(width: number, height: number): ArrayBuffer {
  const b = new Uint8Array(2 + 4 + 11)
  b.set([0xff, 0xd8], 0) // SOI
  b.set([0xff, 0xe0, 0x00, 0x02], 2) // APP0, length 2 (no payload)
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 6) // SOF0, length 17, precision 8
  const dv = new DataView(b.buffer)
  dv.setUint16(11, height)
  dv.setUint16(13, width)
  return b.buffer
}

describe('readImageHeaderDims', () => {
  it('reads PNG IHDR dimensions', () => {
    expect(readImageHeaderDims(pngHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 })
    expect(readImageHeaderDims(pngHeader(30000, 30000))).toEqual({ width: 30000, height: 30000 })
  })
  it('reads JPEG SOF dimensions past leading segments', () => {
    expect(readImageHeaderDims(jpegHeader(800, 600))).toEqual({ width: 800, height: 600 })
  })
  it('returns null for non-PNG/JPEG or truncated data', () => {
    expect(readImageHeaderDims(new Uint8Array([1, 2, 3]).buffer)).toBeNull()
    expect(readImageHeaderDims(new Uint8Array(24).buffer)).toBeNull()
  })
})

describe('assertDecodable', () => {
  it('accepts dimensions up to the cap', () => {
    expect(() => assertDecodable(1, 1)).not.toThrow()
    expect(() => assertDecodable(MAX_DECODE_DIM, MAX_DECODE_DIM)).not.toThrow()
  })
  it('rejects over-cap, zero, negative and non-finite dimensions (bomb guard)', () => {
    expect(() => assertDecodable(MAX_DECODE_DIM + 1, 16)).toThrow()
    expect(() => assertDecodable(30000, 30000)).toThrow()
    expect(() => assertDecodable(0, 16)).toThrow()
    expect(() => assertDecodable(16, -4)).toThrow()
    expect(() => assertDecodable(Number.NaN, 16)).toThrow()
    expect(() => assertDecodable(Number.POSITIVE_INFINITY, 16)).toThrow()
  })
})

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
