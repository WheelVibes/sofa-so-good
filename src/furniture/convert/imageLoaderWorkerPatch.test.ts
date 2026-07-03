import { ImageLoader, LoadingManager } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetImageLoaderPatchForTest, patchImageLoaderForWorker } from './imageLoaderWorkerPatch'

/**
 * Runs in the default (Node) test environment, which — like a real Worker —
 * has no `document`, so this is a genuine exercise of the "no document"
 * branch (unlike a happy-dom test file, where `document` exists and the
 * patch would correctly no-op). What it CANNOT exercise for real is an actual
 * image decode: Node has no `createImageBitmap`, so the fetch/decode chain is
 * driven with mocks instead of real image bytes — the real decode is only
 * provable in a browser (see the convert-off-main-thread scenario in
 * docs/visual-verification-playbook.md).
 */

afterEach(() => {
  __resetImageLoaderPatchForTest()
  vi.unstubAllGlobals()
})

describe('patchImageLoaderForWorker', () => {
  it('is a no-op when document is defined (main-thread realm)', () => {
    vi.stubGlobal('document', {})
    const original = ImageLoader.prototype.load
    patchImageLoaderForWorker()
    expect(ImageLoader.prototype.load).toBe(original)
  })

  it('replaces ImageLoader.prototype.load when document is undefined, and is idempotent', () => {
    expect(typeof document).toBe('undefined') // sanity: this env has no document
    const original = ImageLoader.prototype.load
    patchImageLoaderForWorker()
    const patched = ImageLoader.prototype.load
    expect(patched).not.toBe(original)
    patchImageLoaderForWorker() // second call: no-op, same function reference
    expect(ImageLoader.prototype.load).toBe(patched)
  })

  it('resolves the URL via the LoadingManager and calls onLoad with the decoded bitmap', async () => {
    patchImageLoaderForWorker()
    const manager = new LoadingManager()
    manager.setURLModifier((url) => `resolved:${url}`)
    const loader = new ImageLoader(manager)

    const fakeBlob = { size: 1 } as Blob
    const fakeBitmap = { width: 1, height: 1 } as unknown as ImageBitmap
    const fetchMock = vi.fn().mockResolvedValue({ blob: () => Promise.resolve(fakeBlob) })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap))

    const onLoad = vi.fn()
    const onError = vi.fn()
    loader.load('texture.jpg', onLoad, undefined, onError)
    expect(fetchMock).toHaveBeenCalledWith('resolved:texture.jpg')
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledWith(fakeBitmap))
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError when the fetch/decode chain rejects', async () => {
    patchImageLoaderForWorker()
    const manager = new LoadingManager()
    const loader = new ImageLoader(manager)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const onLoad = vi.fn()
    const onError = vi.fn()
    loader.load('missing.jpg', onLoad, undefined, onError)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onLoad).not.toHaveBeenCalled()
    expect((onError.mock.calls[0][0] as Error).message).toBe('network down')
  })
})
