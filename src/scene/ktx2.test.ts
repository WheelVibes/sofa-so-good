import type { WebGLRenderer } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetKtx2ForTest,
  bindKtx2Renderer,
  getKtx2Loader,
  isKtx2Ready,
  KTX2_TRANSCODER_PATH,
  ktx2Support,
} from './ktx2'

/** A renderer stub exposing only what `KTX2Loader.detectSupport` reads off a WebGLRenderer. */
function fakeRenderer(extensions: readonly string[]): WebGLRenderer {
  const set = new Set(extensions)
  return {
    extensions: {
      has: (name: string) => set.has(name),
      get: (name: string) =>
        set.has(name) ? { getSupportedProfiles: () => ['ldr'] as string[] } : null,
    },
  } as unknown as WebGLRenderer
}

const DESKTOP = ['EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc']
const MOBILE = ['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc']

describe('renderer-bound KTX2 registration', () => {
  beforeEach(() => {
    __resetKtx2ForTest()
  })

  it('hands out NO loader until a renderer has bound one', () => {
    // An unbound KTX2Loader throws on its first `load()` (three r184 KTX2Loader.js:361), so
    // returning one here would turn "this build ships no KTX2" into a hard failure on whichever
    // asset happened to load first.
    expect(getKtx2Loader()).toBeNull()
    expect(isKtx2Ready()).toBe(false)
    expect(ktx2Support()).toBeNull()
  })

  it('binds a renderer, self-hosts the transcoder, and reports the detected formats', () => {
    const r = bindKtx2Renderer(fakeRenderer(DESKTOP))
    expect(r.ready).toBe(true)
    expect(r.created).toBe(true)
    expect(isKtx2Ready()).toBe(true)
    expect(r.support).toEqual({
      astcSupported: false,
      etc1Supported: false,
      etc2Supported: false,
      dxtSupported: true,
      bptcSupported: true,
      pvrtcSupported: false,
    })
    const loader = getKtx2Loader()
    expect(loader).not.toBeNull()
    // No CDN: the transcoder is committed under public/basis and kept in sync with the installed
    // three by scripts/copy-decoders.mjs.
    expect((loader as unknown as { transcoderPath: string }).transcoderPath).toBe(
      KTX2_TRANSCODER_PATH,
    )
    expect(KTX2_TRANSCODER_PATH).toContain('/basis/')
  })

  it('re-binding the SAME support set keeps the one loader', () => {
    // three warns "Multiple active KTX2 loaders may cause performance issues" — each instance
    // downloads its own transcoder and allocates its own worker pool. A context restore on the
    // same device reports the same extensions, which is the common case.
    const first = bindKtx2Renderer(fakeRenderer(DESKTOP))
    const again = bindKtx2Renderer(fakeRenderer(DESKTOP))
    expect(again.created).toBe(false)
    expect(again.ready).toBe(true)
    expect(getKtx2Loader()).toBe(getKtx2Loader())
    expect(again.support).toEqual(first.support)
  })

  it('REPLACES the loader when the supported format set actually changes', () => {
    // `detectSupport` only writes `workerConfig`, and that object is captured into each transcode
    // worker at creation — so an in-place re-detect cannot reach workers that already exist. And
    // three's `dispose()` revokes `workerSourceURL` while leaving `transcoderPending` set, so a
    // disposed instance can never rebuild its own workers. Hence a fresh instance, not a re-detect.
    bindKtx2Renderer(fakeRenderer(DESKTOP))
    const before = getKtx2Loader()
    const changed = bindKtx2Renderer(fakeRenderer(MOBILE))
    expect(changed.created).toBe(true)
    expect(changed.support?.astcSupported).toBe(true)
    expect(changed.support?.dxtSupported).toBe(false)
    expect(getKtx2Loader()).not.toBe(before)
  })

  it('leaves the previous binding alone when detectSupport throws', () => {
    // A renderer with no extension registry: a stubbed test renderer, or a context torn down
    // mid-restore. Swapping in a half-configured loader would be worse than keeping the old one.
    bindKtx2Renderer(fakeRenderer(DESKTOP))
    const good = getKtx2Loader()
    const r = bindKtx2Renderer({} as unknown as WebGLRenderer)
    expect(r.created).toBe(false)
    expect(r.ready).toBe(true)
    expect(getKtx2Loader()).toBe(good)
  })

  it('reports not-ready when the very first bind throws', () => {
    const r = bindKtx2Renderer({} as unknown as WebGLRenderer)
    expect(r.ready).toBe(false)
    expect(getKtx2Loader()).toBeNull()
  })
})
