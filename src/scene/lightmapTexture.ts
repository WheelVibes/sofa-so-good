/**
 * Format-aware loading for one baked lightmap, with a PNG fallback.
 *
 * `VisibilityLightmaps` needs a `(url) => Texture` that answers **synchronously** — the applier
 * assigns the texture into a material's `visMap` uniform inside the same attach pass that compiles
 * the shader, and that pass is what the 216 ms mount cost buys. `TextureLoader.load()` obliges: it
 * returns an empty `Texture` immediately and fills in `image` + `needsUpdate` when the fetch lands.
 *
 * **`KTX2Loader.load()` does not** — it returns `undefined` and hands the finished
 * `CompressedTexture` to an `onLoad` callback, because the container has to be parsed and
 * transcoded on a worker before its GPU format is even known. So the KTX2 path allocates an empty
 * `CompressedTexture` up front and transplants the transcoded result's fields into it on arrival.
 * That is safe for a specific reason worth stating: until `needsUpdate` is raised the texture's
 * `version` stays 0, three never calls `uploadTexture`, and the sampler simply reads black — the
 * identical transient the PNG path already has between `load()` and decode.
 *
 * **The PNG fallback is not decoration.** KTX2 needs a live WebGL context to pick a transcode
 * target (`src/scene/ktx2.ts`) and a reachable `basis_transcoder.wasm`. Neither is guaranteed in
 * the Electron/Capacitor packages or a file:// offline build, and a set that fails to load is
 * invisible in a screenshot — it looks exactly like a correctly-working subtle lighting term. So a
 * `.ktx2` entry with no usable transcoder silently retries the sibling `.png`, which the bake emits
 * alongside for exactly this reason.
 */
import { CompressedTexture, LinearFilter, NoColorSpace, type Texture, TextureLoader } from 'three'
import { getKtx2Loader } from './ktx2'

/** Swap a `.ktx2` URL for its PNG sibling. Any other URL is returned unchanged. */
export function pngSiblingUrl(url: string): string {
  return url.replace(/\.ktx2(\?.*)?$/i, '.png$1')
}

export interface LightmapTextureLoaderOptions {
  /** Called whenever a map finishes decoding — the canvas is `frameloop="demand"`. */
  onDecode: () => void
  /** Injected for tests; defaults to the app's renderer-bound singleton. */
  ktx2?: ReturnType<typeof getKtx2Loader>
  /** Injected for tests. */
  textureLoader?: TextureLoader
  /** Injected for tests; receives the message a dev build would log. */
  onWarn?: (message: string) => void
}

export interface LightmapTextureLoader {
  /** Resolve a map URL to a texture. Cached per URL — one map serves every mesh that keys to it. */
  load(url: string): Texture
  /** `{ png, ktx2, fallback }` counts, for the load assertion / probes. */
  stats(): { png: number; ktx2: number; fallback: number }
}

/**
 * Build the per-attach loader. One instance per attach pass, holding its own URL cache: a map is
 * shared by every material whose mesh keys to it, and uploading the same 256 px image twice is
 * pure waste.
 */
export function createLightmapTextureLoader(
  opts: LightmapTextureLoaderOptions,
): LightmapTextureLoader {
  const { onDecode, onWarn } = opts
  const png = opts.textureLoader ?? new TextureLoader()
  const ktx2 = opts.ktx2 !== undefined ? opts.ktx2 : getKtx2Loader()
  const cache = new Map<string, Texture>()
  const counts = { png: 0, ktx2: 0, fallback: 0 }

  const loadPng = (url: string): Texture => {
    counts.png += 1
    return png.load(url, () => onDecode())
  }

  const loadKtx2 = (url: string, transcoder: NonNullable<typeof ktx2>): Texture => {
    counts.ktx2 += 1
    // Empty 0x0 shell: `version` stays 0 so three never tries to upload a texture with no mip
    // levels, and `prepareVisibilityTexture`'s `textureHasImageData` guard stays false.
    const shell = new CompressedTexture([], 0, 0)
    shell.colorSpace = NoColorSpace
    shell.generateMipmaps = false
    shell.minFilter = LinearFilter
    transcoder.load(
      url,
      (decoded) => {
        shell.mipmaps = decoded.mipmaps
        shell.image = decoded.image
        shell.format = decoded.format
        shell.type = decoded.type
        shell.internalFormat = decoded.internalFormat
        shell.wrapS = decoded.wrapS
        shell.wrapT = decoded.wrapT
        shell.magFilter = decoded.magFilter
        // NOT `decoded.colorSpace`. A lightmap is DATA: the shipped set stores `pow(v, encode)` and
        // the shader decodes it with `pow(t, 1/encode)`, sampling the raw texel. The PNG path gets
        // `NoColorSpace` by default, so tagging the KTX2 sRGB would apply a transfer the PNG set
        // never had and shift every texel — the exact class of change `IRRADIANCE_GAIN`'s
        // hard-equality test exists to catch.
        shell.colorSpace = NoColorSpace
        shell.minFilter = LinearFilter
        shell.generateMipmaps = false
        // The transcoded texture was never uploaded, so this frees only its CPU-side mip buffers'
        // ownership; the buffers themselves now belong to `shell`.
        decoded.dispose()
        shell.needsUpdate = true
        onDecode()
      },
      undefined,
      (err) => {
        onWarn?.(`lightmaps: KTX2 transcode failed for ${url} (${String(err)}) — no map applied`)
      },
    )
    return shell
  }

  return {
    load(url) {
      const hit = cache.get(url)
      if (hit) return hit
      let tex: Texture
      if (/\.ktx2(\?|$)/i.test(url)) {
        if (ktx2) {
          tex = loadKtx2(url, ktx2)
        } else {
          counts.fallback += 1
          onWarn?.(
            `lightmaps: no renderer-bound KTX2 transcoder — falling back to the PNG sibling of ${url}`,
          )
          tex = loadPng(pngSiblingUrl(url))
        }
      } else {
        tex = loadPng(url)
      }
      cache.set(url, tex)
      return tex
    },
    stats() {
      return { ...counts }
    },
  }
}
