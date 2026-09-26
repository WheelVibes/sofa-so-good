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
 *
 * **There are TWO ways a transcoder can be unusable, and the second one is the likely one (C3).**
 * `getKtx2Loader()` returning `null` is only the "no renderer has bound one" case. In the
 * Electron/Capacitor/`file://` packages a renderer DOES exist, so `detectSupport` succeeds and a
 * loader is bound — what fails there is fetching `public/basis/basis_transcoder.wasm` or spawning
 * the blob-URL worker under a `file:` origin, and the same happens to any deploy that serves
 * `.wasm` with a wrong MIME type or loses `public/basis/` from the build. That failure arrives on
 * `KTX2Loader.load`'s error callback, all 229 maps at once, and used to do nothing but call a
 * DEV-only warn — leaving the shell at `version === 0`, the material sampling black, and the
 * console clean in the one environment that cannot be debugged from a screenshot. Both paths now
 * retry the PNG, and both are logged in PRODUCTION.
 */
import {
  CompressedTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  type Texture,
  TextureLoader,
  UnsignedByteType,
} from 'three'
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
  /**
   * Receives a message about a map that FAILED, in every build.
   *
   * Separate from `onWarn` — which is dev chatter — because a total loss of the baked GI is
   * invisible in a screenshot and must not depend on `import.meta.env.DEV`. Defaults to
   * `console.warn`, throttled by {@link shouldLogFailure} so 229 simultaneous failures produce
   * seven lines rather than 229.
   */
  onError?: (message: string) => void
}

/**
 * Whether the `n`-th failure (1-based) should be logged.
 *
 * A transcoder that cannot load fails for EVERY map, so the honest signal is "this happened, and
 * it happened a lot" rather than one line per map. The first three land immediately (so the very
 * first failure is visible with no delay and no timer), then every fiftieth reports the running
 * total — seven lines for the whole 229-map set, and the last one states the magnitude.
 */
export function shouldLogFailure(n: number): boolean {
  return n <= 3 || n % 50 === 0
}

/**
 * The `CompressedTexture` fields the PNG fallback rewrites, widened.
 *
 * three types `isCompressedTexture` as readonly and `format` as a `CompressedPixelFormat` — both
 * correct for a texture that stays compressed, and both in the way of one that must stop being
 * compressed in place. At RUNTIME the flag is an own property assigned in the constructor, so
 * overwriting it is a plain assignment; this type says so rather than reaching for `any`.
 */
interface UncompressibleTexture {
  isCompressedTexture: boolean
  mipmaps: unknown[]
  flipY: boolean
  format: number
  type: number
  internalFormat: string | null
  source: Texture['source']
}

export interface LightmapTextureLoader {
  /** Resolve a map URL to a texture. Cached per URL — one map serves every mesh that keys to it. */
  load(url: string): Texture
  /** `{ png, ktx2, fallback, transcodeError, fallbackError }` counts, for the assertion/probes. */
  stats(): {
    png: number
    ktx2: number
    fallback: number
    transcodeError: number
    fallbackError: number
  }
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
  // Deliberately NOT gated on `import.meta.env.DEV`: this is the only signal a packaged build
  // gives that its entire baked GI is missing (C3).
  const report = opts.onError ?? ((m: string) => console.warn(m))
  const png = opts.textureLoader ?? new TextureLoader()
  const ktx2 = opts.ktx2 !== undefined ? opts.ktx2 : getKtx2Loader()
  const cache = new Map<string, Texture>()
  const counts = { png: 0, ktx2: 0, fallback: 0, transcodeError: 0, fallbackError: 0 }

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
        counts.transcodeError += 1
        if (shouldLogFailure(counts.transcodeError)) {
          report(
            `lightmaps: KTX2 transcode failed for ${url} (${String(err)}) — retrying the PNG ` +
              `sibling (${counts.transcodeError} failed so far). Check that ` +
              'public/basis/basis_transcoder.wasm is reachable and served as application/wasm.',
          )
        }
        fallbackToPng(url, shell)
      },
    )
    return shell
  }

  /**
   * Load the PNG sibling INTO the shell the caller already holds.
   *
   * It has to be the same object: `applyVisibilityLightmap` captured this texture in its
   * `onBeforeCompile` closure and bound it as `shader.uniforms.visMap` in the same synchronous
   * attach pass, so swapping the cache entry would reach nothing that is already on screen.
   *
   * A `CompressedTexture` cannot hold an `HTMLImageElement`, so the shell is converted: three
   * duck-types the upload path on `isCompressedTexture`, which `CompressedTexture` sets as an OWN
   * property in its constructor, so assigning `false` is a plain overwrite rather than a
   * prototype fight. **`flipY` must come back to `true`** — `CompressedTexture` pins it `false`
   * because compressed data cannot be flipped (which is why the bake's KTX2 encode sets
   * `isYFlip`), and a PNG uploaded unflipped would land every lightmap upside down in its atlas
   * slot, which reads as a plausible-but-wrong bake rather than as a failure.
   *
   * The cast is the point of {@link UncompressibleTexture}: three's types declare
   * `isCompressedTexture` readonly and narrow `format` to a `CompressedPixelFormat`, which is
   * right for a texture that stays compressed and is exactly what this one stops being.
   */
  const fallbackToPng = (url: string, shell: CompressedTexture): void => {
    counts.fallback += 1
    png.load(
      pngSiblingUrl(url),
      (decoded) => {
        const plain = shell as unknown as UncompressibleTexture
        plain.isCompressedTexture = false
        plain.mipmaps = []
        plain.flipY = true
        plain.format = RGBAFormat
        plain.type = UnsignedByteType
        plain.internalFormat = null
        plain.source = decoded.source
        // Unchanged from the shell's own setup, restated because they are what makes a lightmap
        // DATA rather than colour and the PNG path must agree with the KTX2 one exactly.
        shell.colorSpace = NoColorSpace
        shell.generateMipmaps = false
        shell.minFilter = LinearFilter
        shell.needsUpdate = true
        onDecode()
      },
      undefined,
      (err) => {
        counts.fallbackError += 1
        if (shouldLogFailure(counts.fallbackError)) {
          report(
            `lightmaps: the PNG fallback for ${url} failed too (${String(err)}) — no baked GI on ` +
              `that surface (${counts.fallbackError} failed so far)`,
          )
        }
      },
    )
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
          // A build that never bound a renderer loses the WHOLE set, so this is a production
          // signal too — the DEV warn stays for anyone watching a dev console.
          onWarn?.(
            `lightmaps: no renderer-bound KTX2 transcoder — falling back to the PNG sibling of ${url}`,
          )
          if (shouldLogFailure(counts.fallback)) {
            report(
              'lightmaps: no renderer-bound KTX2 transcoder — falling back to the PNG siblings ' +
                `(${counts.fallback} so far). <Ktx2Controller /> must mount first inside the Canvas.`,
            )
          }
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
