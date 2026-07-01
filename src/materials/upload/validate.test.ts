import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES, MAX_IMAGE_DIM, validateImageFile } from './validate'

/** A File with a forced byte size (avoids allocating huge buffers in tests). */
function mkFile(name: string, type: string, size = 1024): File {
  const f = new File([new Uint8Array(8)], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const stubBitmap = (width: number, height: number) =>
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close: () => {} })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateImageFile', () => {
  it('rejects a file over the byte limit', async () => {
    const res = await validateImageFile(mkFile('big.png', 'image/png', MAX_IMAGE_BYTES + 1))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/too large/i)
  })

  it('rejects an unsupported type/extension', async () => {
    const res = await validateImageFile(mkFile('notes.txt', 'application/octet-stream'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/unsupported/i)
  })

  it('accepts GPU-compressed KTX2/DDS by bypassing the bitmap probe (dims deferred)', async () => {
    for (const name of ['tex.ktx2', 'tex.dds']) {
      const res = await validateImageFile(mkFile(name, 'application/octet-stream'))
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.width).toBe(0)
        expect(res.height).toBe(0)
      }
    }
  })

  it('accepts a decodable native image within the dimension cap', async () => {
    stubBitmap(1024, 768)
    const res = await validateImageFile(mkFile('albedo.png', 'image/png'))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.width).toBe(1024)
      expect(res.height).toBe(768)
      expect(res.mime).toBe('image/png')
    }
  })

  it('rejects an image larger than the dimension cap', async () => {
    stubBitmap(MAX_IMAGE_DIM + 1, 512)
    const res = await validateImageFile(mkFile('huge.jpg', 'image/jpeg'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(new RegExp(`${MAX_IMAGE_DIM}`))
  })

  it('rejects a file that fails to decode', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('bad image')
      }),
    )
    const res = await validateImageFile(mkFile('corrupt.webp', 'image/webp'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/decode/i)
  })
})
