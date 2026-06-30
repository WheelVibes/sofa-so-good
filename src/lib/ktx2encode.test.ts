import { describe, expect, it } from 'vitest'
import { encodeKtx2, isKtx2EncodeAvailable } from './ktx2encode'

// KTX2 file identifier: «´KTX 20»\r\n\x1a\n (12 bytes).
const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]

function makeRgba(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = (i * 7) % 256
    px[i * 4 + 1] = 128
    px[i * 4 + 2] = (i * 3) % 256
    px[i * 4 + 3] = 255
  }
  return px
}

describe('ktx2 encoder', () => {
  it('reports availability', () => {
    expect(isKtx2EncodeAvailable()).toBe(true)
  })

  it('rejects degenerate input without throwing', async () => {
    expect(await encodeKtx2(new Uint8Array(0), 0, 0)).toBeNull()
    // RGBA buffer too small for the claimed dimensions.
    expect(await encodeKtx2(new Uint8Array(4), 8, 8)).toBeNull()
  })

  it('encodes raw RGBA8 to a valid KTX2 container', async () => {
    const w = 32
    const h = 32
    const out = await encodeKtx2(makeRgba(w, h), w, h)
    expect(out).not.toBeNull()
    expect(out!.byteLength).toBeGreaterThan(KTX2_MAGIC.length)
    expect(Array.from(out!.subarray(0, KTX2_MAGIC.length))).toEqual(KTX2_MAGIC)
  }, 60_000)
})
