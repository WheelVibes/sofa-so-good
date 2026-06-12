/**
 * Unit tests for the GPU-compressed texture decode helpers.
 *
 * GPU readback (WebGL renderer) is not available in jsdom; those paths are
 * covered by the interaction scenario. Here we test:
 *  - Extension validation (isSupportedTexture accepts .ktx2/.dds)
 *  - Pure-JS KTX2 uncompressed decode (no WebGL needed)
 *  - Pure-JS DDS uncompressed decode (no WebGL needed)
 *  - Error paths: corrupt file, unsupported format, WebGL unavailable
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { decodeDds, decodeKtx2 } from './decodeGpuTexture'
import { EXTRA_TEXTURE_EXTENSIONS, isSupportedTexture } from './decodeImage'

/**
 * Node's `readFileSync` returns a `Buffer` that is a *view* into a shared
 * 8 KB pool buffer.  `buf.buffer` returns the full pool, not just the file
 * bytes.  Always copy to a fresh `ArrayBuffer` with this helper.
 */
function fileToArrayBuffer(path: string): ArrayBuffer {
  const buf = readFileSync(path)
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  return ab
}

// ─── Extension gate ────────────────────────────────────────────────────────────

describe('isSupportedTexture with KTX2/DDS', () => {
  it('accepts .ktx2 and .dds extensions', () => {
    expect(isSupportedTexture('texture.ktx2')).toBe(true)
    expect(isSupportedTexture('TEXTURE.KTX2')).toBe(true)
    expect(isSupportedTexture('texture.dds')).toBe(true)
    expect(isSupportedTexture('SURFACE.DDS')).toBe(true)
  })

  it('includes .ktx2 and .dds in EXTRA_TEXTURE_EXTENSIONS', () => {
    expect(EXTRA_TEXTURE_EXTENSIONS).toContain('.ktx2')
    expect(EXTRA_TEXTURE_EXTENSIONS).toContain('.dds')
  })

  it('still rejects unknown extensions', () => {
    expect(isSupportedTexture('texture.abc')).toBe(false)
    expect(isSupportedTexture('texture.glb')).toBe(false)
  })
})

// ─── KTX2 pure-JS decode (uncompressed fixture) ───────────────────────────────

describe('decodeKtx2 (uncompressed R8G8B8A8_SRGB fixture)', () => {
  const fixturePath = join(__dirname, '__fixtures__/solid-teal-4x4.ktx2')

  it('decodes the 4×4 teal fixture to RGBA8 pixels', async () => {
    const buf = fileToArrayBuffer(fixturePath)
    const img = await decodeKtx2(buf)
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
    expect(img.data).toBeInstanceOf(Uint8ClampedArray)
    expect(img.data.length).toBe(4 * 4 * 4)
    // First pixel should be teal: R=0, G=255, B=170, A=255
    expect(img.data[0]).toBe(0)
    expect(img.data[1]).toBe(255)
    expect(img.data[2]).toBe(170)
    expect(img.data[3]).toBe(255)
  })

  it('returns DecodedImage with correct shape', async () => {
    const buf = fileToArrayBuffer(fixturePath)
    const img = await decodeKtx2(buf)
    expect(typeof img.width).toBe('number')
    expect(typeof img.height).toBe('number')
    expect(img.data).toBeInstanceOf(Uint8ClampedArray)
  })
})

// ─── KTX2 error paths ─────────────────────────────────────────────────────────

describe('decodeKtx2 error paths', () => {
  it('throws a friendly error on corrupt input', async () => {
    const corrupt = new ArrayBuffer(32)
    new Uint8Array(corrupt).fill(0xff) // all 0xff — not a valid KTX2 file
    await expect(decodeKtx2(corrupt)).rejects.toThrow()
  })

  it('throws on empty ArrayBuffer', async () => {
    await expect(decodeKtx2(new ArrayBuffer(0))).rejects.toThrow()
  })
})

// ─── KTX2 Basis-compressed path (mocked — no real WebGL in tests) ─────────────

describe('decodeKtx2 Basis-compressed (mocked WebGL path)', () => {
  it('falls through to WebGL path for VK_FORMAT_UNDEFINED', async () => {
    // Build a minimal KTX2 container where vkFormat = 0 (VK_FORMAT_UNDEFINED /
    // Basis-compressed). We mock createOffscreenRenderer to fail gracefully so
    // we can assert the right error propagates.
    // The unit test validates the routing; full GPU transcode is verified by the
    // interaction scenario (SwiftShader supports WebGL).
    vi.stubGlobal('OffscreenCanvas', undefined)
    const { write, createDefaultContainer, KHR_SUPERCOMPRESSION_NONE } = await import('ktx-parse')
    const container = createDefaultContainer()
    container.vkFormat = 0 // VK_FORMAT_UNDEFINED
    container.pixelWidth = 4
    container.pixelHeight = 4
    container.levelCount = 1
    container.supercompressionScheme = KHR_SUPERCOMPRESSION_NONE
    container.levels = [{ levelData: new Uint8Array(64), uncompressedByteLength: 64 }]
    const writtenBuf = write(container)
    const buf = writtenBuf.buffer.slice(
      writtenBuf.byteOffset,
      writtenBuf.byteOffset + writtenBuf.byteLength,
    ) as ArrayBuffer

    await expect(decodeKtx2(buf)).rejects.toThrow(/OffscreenCanvas|WebGL|GPU/)
    vi.unstubAllGlobals()
  })
})

// ─── DDS pure-JS decode (uncompressed fixture) ────────────────────────────────

describe('decodeDds (uncompressed ARGB fixture)', () => {
  const fixturePath = join(__dirname, '__fixtures__/solid-orange-4x4.dds')

  it('decodes the 4×4 orange DDS fixture to RGBA8 pixels', async () => {
    const buf = fileToArrayBuffer(fixturePath)
    const img = await decodeDds(buf)
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
    expect(img.data).toBeInstanceOf(Uint8ClampedArray)
    expect(img.data.length).toBe(4 * 4 * 4)
    // DDSLoader's loadARGBMip reads BGRA layout and re-orders to RGBA.
    // Our fixture stores pixels as BGRA = [0x00, 0x88, 0xFF, 0xFF]
    // → after swap: R=0xFF=255, G=0x88=136, B=0x00=0, A=0xFF=255
    expect(img.data[0]).toBe(255) // R
    expect(img.data[1]).toBe(136) // G
    expect(img.data[2]).toBe(0) // B
    expect(img.data[3]).toBe(255) // A
  })
})

// ─── DDS error paths ──────────────────────────────────────────────────────────

describe('decodeDds error paths', () => {
  it('throws on corrupt / invalid input', async () => {
    // A buffer that starts with 0xff bytes is not valid DDS (bad magic)
    const corrupt = new ArrayBuffer(128)
    new Uint8Array(corrupt).fill(0xff)
    // DDSLoader logs a console.error and returns an empty mipmaps array
    await expect(decodeDds(corrupt)).rejects.toThrow()
  })

  it('throws on empty ArrayBuffer', async () => {
    await expect(decodeDds(new ArrayBuffer(0))).rejects.toThrow()
  })
})

// ─── WebGL context unavailability ─────────────────────────────────────────────
// Both KTX2 Basis-compressed and DDS compressed paths create an offscreen
// WebGLRenderer.  Here we verify the error message is user-friendly when
// OffscreenCanvas is unavailable (e.g. an unsupported headless environment).
// The actual GPU-compressed transcode is verified by the interaction scenario
// (SwiftShader supports WebGL).

describe('GPU path error messages (OffscreenCanvas unavailable)', () => {
  it('KTX2 Basis path reports context failure clearly', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    // Build a minimal Basis-compressed (VK_FORMAT_UNDEFINED) KTX2 buffer
    const { write, createDefaultContainer, KHR_SUPERCOMPRESSION_NONE } = await import('ktx-parse')
    const container = createDefaultContainer()
    container.vkFormat = 0 // VK_FORMAT_UNDEFINED → Basis
    container.pixelWidth = 4
    container.pixelHeight = 4
    container.levelCount = 1
    container.supercompressionScheme = KHR_SUPERCOMPRESSION_NONE
    container.levels = [{ levelData: new Uint8Array(64), uncompressedByteLength: 64 }]
    const writtenBuf2 = write(container)
    const ab = writtenBuf2.buffer.slice(
      writtenBuf2.byteOffset,
      writtenBuf2.byteOffset + writtenBuf2.byteLength,
    ) as ArrayBuffer
    await expect(decodeKtx2(ab)).rejects.toThrow(/OffscreenCanvas|WebGL|GPU/)
    vi.unstubAllGlobals()
  })
})
