/**
 * Unit tests for the native share-sheet helper (feature `shareCardNative`):
 * support detection + the share result matrix (shared/aborted/unsupported/
 * failed) against a fake `navigator`-shaped object — no real DOM/browser API
 * needed since `File`/`Blob` are available in the node test environment.
 */
import { describe, expect, it, vi } from 'vitest'
import { canNativeShareFiles, type ShareCapableNavigator, shareCardFile } from './shareNative'

function pngBlob(): Blob {
  return new Blob(['fake-png-bytes'], { type: 'image/png' })
}

describe('canNativeShareFiles', () => {
  it('is false when navigator is undefined/null', () => {
    expect(canNativeShareFiles(undefined)).toBe(false)
    expect(canNativeShareFiles(null)).toBe(false)
  })

  it('is false when canShare/share are missing', () => {
    expect(canNativeShareFiles({})).toBe(false)
    expect(canNativeShareFiles({ share: vi.fn() })).toBe(false)
    expect(canNativeShareFiles({ canShare: () => true })).toBe(false)
  })

  it('is true when canShare({files}) reports support', () => {
    const nav: ShareCapableNavigator = { canShare: () => true, share: vi.fn() }
    expect(canNativeShareFiles(nav)).toBe(true)
  })

  it('is false when canShare({files}) reports no support', () => {
    const nav: ShareCapableNavigator = { canShare: () => false, share: vi.fn() }
    expect(canNativeShareFiles(nav)).toBe(false)
  })

  it('is false (not throwing) when canShare itself throws', () => {
    const nav: ShareCapableNavigator = {
      canShare: () => {
        throw new Error('nope')
      },
      share: vi.fn(),
    }
    expect(canNativeShareFiles(nav)).toBe(false)
  })
})

describe('shareCardFile', () => {
  it('returns "unsupported" when share is not a function', async () => {
    const result = await shareCardFile({}, pngBlob(), 'sofa-hero-x.png')
    expect(result).toBe('unsupported')
  })

  it('returns "unsupported" when canShare rejects the file', async () => {
    const nav: ShareCapableNavigator = { canShare: () => false, share: vi.fn() }
    const result = await shareCardFile(nav, pngBlob(), 'sofa-hero-x.png')
    expect(result).toBe('unsupported')
    expect(nav.share).not.toHaveBeenCalled()
  })

  it('shares a File built from the blob + filename on success', async () => {
    let sharedFile: File | undefined
    const nav: ShareCapableNavigator = {
      canShare: () => true,
      share: vi.fn(async (data) => {
        sharedFile = data.files?.[0]
      }),
    }
    const result = await shareCardFile(nav, pngBlob(), 'sofa-hero-my-design.png', {
      title: 'My design',
    })
    expect(result).toBe('shared')
    expect(nav.share).toHaveBeenCalledWith(expect.objectContaining({ title: 'My design' }))
    expect(sharedFile).toBeInstanceOf(File)
    expect(sharedFile?.name).toBe('sofa-hero-my-design.png')
    expect(sharedFile?.type).toBe('image/png')
  })

  it('returns "aborted" (not "failed") when the user cancels the share sheet', async () => {
    const nav: ShareCapableNavigator = {
      canShare: () => true,
      share: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
    }
    const result = await shareCardFile(nav, pngBlob(), 'sofa-hero-x.png')
    expect(result).toBe('aborted')
  })

  it('returns "failed" for any other rejection', async () => {
    const nav: ShareCapableNavigator = {
      canShare: () => true,
      share: vi.fn().mockRejectedValue(new Error('DataError')),
    }
    const result = await shareCardFile(nav, pngBlob(), 'sofa-hero-x.png')
    expect(result).toBe('failed')
  })

  it('works without canShare (skips the pre-check, still shares)', async () => {
    const nav: ShareCapableNavigator = { share: vi.fn().mockResolvedValue(undefined) }
    const result = await shareCardFile(nav, pngBlob(), 'sofa-hero-x.png')
    expect(result).toBe('shared')
  })
})
