import { CompressedTexture, NoColorSpace, SRGBColorSpace, Texture, type TextureLoader } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createLightmapTextureLoader, pngSiblingUrl } from './lightmapTexture'

type Ktx2Stub = Parameters<typeof createLightmapTextureLoader>[0]['ktx2']

/** A `TextureLoader` stand-in with `TextureLoader`'s synchronous-return contract. */
function fakePngLoader() {
  const urls: string[] = []
  const loader = {
    load(url: string, onLoad?: (t: Texture) => void) {
      urls.push(url)
      const t = new Texture()
      queueMicrotask(() => onLoad?.(t))
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
    expect(l.stats()).toEqual({ png: 1, ktx2: 0, fallback: 0 })
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
    expect(l.stats()).toEqual({ png: 0, ktx2: 1, fallback: 0 })
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
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: png.loader,
      ktx2: null,
      onWarn: warn,
    })
    const tex = l.load('/assets/lightmaps/x.ktx2')
    expect(tex).toBeInstanceOf(Texture)
    expect(tex).not.toBeInstanceOf(CompressedTexture)
    expect(png.urls).toEqual(['/assets/lightmaps/x.png'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(l.stats()).toEqual({ png: 1, ktx2: 0, fallback: 1 })
  })

  it('warns rather than throws when a transcode fails', () => {
    const ktx2 = fakeKtx2()
    const warn = vi.fn()
    const l = createLightmapTextureLoader({
      onDecode: () => {},
      textureLoader: fakePngLoader().loader,
      ktx2: ktx2.loader,
      onWarn: warn,
    })
    l.load('/assets/lightmaps/x.ktx2')
    expect(() => ktx2.calls[0].onError(new Error('bad container'))).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
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
    expect(l.stats()).toEqual({ png: 1, ktx2: 1, fallback: 0 })
  })
})
