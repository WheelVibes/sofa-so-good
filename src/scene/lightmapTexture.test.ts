import { CompressedTexture, NoColorSpace, SRGBColorSpace, Texture, type TextureLoader } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createLightmapTextureLoader, pngSiblingUrl, shouldLogFailure } from './lightmapTexture'

/** Zero counts, so a test states only the fields it is actually about. */
const noCounts = { png: 0, ktx2: 0, fallback: 0, transcodeError: 0, fallbackError: 0 }

type Ktx2Stub = Parameters<typeof createLightmapTextureLoader>[0]['ktx2']

/** A `TextureLoader` stand-in with `TextureLoader`'s synchronous-return contract. */
function fakePngLoader(mode: 'ok' | 'fail' = 'ok') {
  const urls: string[] = []
  const loader = {
    load(url: string, onLoad?: (t: Texture) => void, _p?: unknown, onError?: (e: unknown) => void) {
      urls.push(url)
      const t = new Texture()
      // A real decode carries an image; the fallback transplants its `source` onto the shell.
      t.image = { width: 4, height: 4 } as never
      if (mode === 'fail') {
        queueMicrotask(() => onError?.(new Error('404')))
      } else {
        queueMicrotask(() => onLoad?.(t))
      }
      return t
    },
  } as unknown as TextureLoader
  return { loader, urls }
}

/** A `KTX2Loader` stand-in with KTX2Loader's callback-only contract (`load` returns nothing). */
function fakeKtx2() {
  const calls: {
    url: string
    onLoad: (t: CompressedTexture) => void
    onError: (e: unknown) => void
  }[] = []
  const loader = {
    load(
      url: string,
      onLoad: (t: CompressedTexture) => void,
      _p: unknown,
      onError: (e: unknown) => void,
    ) {
      calls.push({ url, onLoad, onError })
    },
  } as unknown as NonNullable<Ktx2Stub>
  return { loader, calls }
}

describe('pngSiblingUrl', () => {
  it('swaps a .ktx2 extension and leaves anything else alone', () => {
    expect(pngSiblingUrl('/a/b-1234.ktx2')).toBe('/a/b-1234.png')
    expect(pngSiblingUrl('/a/b-1234.ktx2?v=2')).toBe('/a/b-1234.png?v=2')
    expect(pngSiblingUrl('/a/b-1234.png')).toBe('/a/b-1234.png')
  })
})

describe('createLightmapTextureLoader', () => {
  it('routes a .png through TextureLoader and caches one Texture per URL', () => {
    // A map is shared by every mesh that keys to it; uploading the same 256 px image twice is waste.
    const png = fakePngLoader()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: png.loader,
      ktx2: null,
    })
    const a = l.load('/assets/lightmaps/x.png')
    const b = l.load('/assets/lightmaps/x.png')
    expect(a).toBe(b)
    expect(png.urls).toEqual(['/assets/lightmaps/x.png'])
    expect(l.stats()).toEqual({ ...noCounts, png: 1 })
  })

  it('returns a texture SYNCHRONOUSLY for a .ktx2, even though KTX2Loader.load does not', () => {
    // The applier assigns the texture into the material's `visMap` uniform in the same attach pass
    // that compiles the shader, so a promise is not an option here.
    const ktx2 = fakeKtx2()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: fakePngLoader().loader,
      ktx2: ktx2.loader,
    })
    const tex = l.load('/assets/lightmaps/x.ktx2')
    expect(tex).toBeInstanceOf(CompressedTexture)
    expect(ktx2.calls).toHaveLength(1)
    // version 0 until data lands, so three never tries to upload a texture with no mip levels.
    expect(tex.version).toBe(0)
    expect(l.stats()).toEqual({ ...noCounts, ktx2: 1 })
  })

  it('transplants the transcoded result and does NOT inherit its colour space', () => {
    // A lightmap is DATA: the set stores pow(v, encode) and the shader decodes the raw texel. An
    // sRGB tag would insert a transfer the PNG set never had and shift every texel -- exactly the
    // class of change IRRADIANCE_GAIN's hard-equality test exists to catch.
    const ktx2 = fakeKtx2()
    const onDecode = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode,
      textureLoader: fakePngLoader().loader,
      ktx2: ktx2.loader,
    })
    const tex = l.load('/assets/lightmaps/x.ktx2')
    const mip = { data: new Uint8Array(16), width: 4, height: 4 }
    const decoded = new CompressedTexture([mip as never], 4, 4)
    decoded.colorSpace = SRGBColorSpace
    ktx2.calls[0].onLoad(decoded)
    expect(tex.mipmaps).toBe(decoded.mipmaps)
    expect(tex.image).toBe(decoded.image)
    expect(tex.colorSpace).toBe(NoColorSpace)
    expect(tex.generateMipmaps).toBe(false)
    expect(tex.version).toBeGreaterThan(0)
    // frameloop="demand": without this the map lands in a material nothing ever redraws.
    expect(onDecode).toHaveBeenCalledTimes(1)
  })

  it('falls back to the PNG sibling when no transcoder is bound', () => {
    // Offline / Electron / Capacitor: no live WebGL context to detectSupport against, or no
    // reachable basis_transcoder.wasm. A set that fails to load is invisible in a screenshot.
    const png = fakePngLoader()
    const warn = vi.fn()
    const error = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: png.loader,
      ktx2: null,
      onWarn: warn,
      onError: error,
    })
    const tex = l.load('/assets/lightmaps/x.ktx2')
    expect(tex).toBeInstanceOf(Texture)
    expect(tex).not.toBeInstanceOf(CompressedTexture)
    expect(png.urls).toEqual(['/assets/lightmaps/x.png'])
    expect(warn).toHaveBeenCalledTimes(1)
    // C3: and it is reported in PRODUCTION too, not only to the DEV warn.
    expect(error).toHaveBeenCalledTimes(1)
    expect(l.stats()).toEqual({ ...noCounts, png: 1, fallback: 1 })
  })

  it('a FAILED transcode retries the PNG sibling, into the same texture object (C3)', async () => {
    // The documented fallback used to fire only when `getKtx2Loader()` was null. In the
    // Electron/Capacitor/file:// packages a renderer exists, so a loader IS bound and what fails
    // is the wasm fetch or the blob worker -- which arrived here, on the error callback, and did
    // nothing but call a DEV-only warn. All 229 maps then sampled black with a clean console.
    const png = fakePngLoader()
    const ktx2 = fakeKtx2()
    const error = vi.fn()
    const onDecode = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode,
      textureLoader: png.loader,
      ktx2: ktx2.loader,
      onError: error,
    })
    const tex = l.load('/assets/lightmaps/x.ktx2') as CompressedTexture
    expect(() => ktx2.calls[0].onError(new Error('wasm 404'))).not.toThrow()
    expect(png.urls).toEqual(['/assets/lightmaps/x.png'])
    await Promise.resolve()

    // The SAME object, because `applyVisibilityLightmap` already bound it as `visMap` in the
    // synchronous attach pass -- swapping the cache entry would reach nothing already on screen.
    expect(tex.version).toBeGreaterThan(0)
    expect(tex.isCompressedTexture).toBe(false)
    expect(tex.mipmaps).toEqual([])
    // A PNG is uploaded flipped; `CompressedTexture` pins `flipY` false because compressed data
    // cannot be. Left false, every lightmap would land upside down in its atlas slot.
    expect(tex.flipY).toBe(true)
    expect(tex.colorSpace).toBe(NoColorSpace)
    expect(tex.generateMipmaps).toBe(false)
    expect(onDecode).toHaveBeenCalledTimes(1)
    expect(l.stats()).toEqual({ ...noCounts, ktx2: 1, fallback: 1, transcodeError: 1 })
  })

  it('reports a failed transcode in PRODUCTION, not only through the DEV warn', () => {
    const ktx2 = fakeKtx2()
    const warn = vi.fn()
    const error = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: fakePngLoader().loader,
      ktx2: ktx2.loader,
      onWarn: warn,
      onError: error,
    })
    l.load('/assets/lightmaps/x.ktx2')
    ktx2.calls[0].onError(new Error('bad container'))
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[0]).toContain('basis_transcoder.wasm')
  })

  it('reports it again when the PNG fallback ALSO fails — that is a total loss', async () => {
    const ktx2 = fakeKtx2()
    const error = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: fakePngLoader('fail').loader,
      ktx2: ktx2.loader,
      onError: error,
    })
    l.load('/assets/lightmaps/x.ktx2')
    ktx2.calls[0].onError(new Error('wasm 404'))
    await Promise.resolve()
    expect(l.stats()).toEqual({
      ...noCounts,
      ktx2: 1,
      fallback: 1,
      transcodeError: 1,
      fallbackError: 1,
    })
    expect(error).toHaveBeenCalledTimes(2)
  })

  it('loads a MIXED set, which is the point of the per-entry format field', () => {
    const png = fakePngLoader()
    const ktx2 = fakeKtx2()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: png.loader,
      ktx2: ktx2.loader,
    })
    l.load('/assets/lightmaps/a.png')
    l.load('/assets/lightmaps/b.ktx2')
    expect(png.urls).toEqual(['/assets/lightmaps/a.png'])
    expect(ktx2.calls.map((c) => c.url)).toEqual(['/assets/lightmaps/b.ktx2'])
    expect(l.stats()).toEqual({ ...noCounts, png: 1, ktx2: 1 })
  })
})

describe('shouldLogFailure', () => {
  it('logs the first three and then every fiftieth — seven lines for a 229-map set', () => {
    const logged = Array.from({ length: 229 }, (_, i) => i + 1).filter(shouldLogFailure)
    expect(logged).toEqual([1, 2, 3, 50, 100, 150, 200])
  })
})
