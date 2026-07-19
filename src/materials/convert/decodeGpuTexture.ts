/**
 * GPU-compressed texture decode helpers for the material-upload pipeline.
 *
 * Decodes `.ktx2` and `.dds` files to straight RGBA8 pixels so the existing
 * `decodeImage` pipeline can re-encode them to WebP.
 *
 * Strategy
 * ────────
 * • KTX2 *uncompressed* (VK_FORMAT_R8G8B8A8_SRGB / _UNORM, R8G8_UNORM, R8_UNORM,
 *   float variants …): parsed entirely in JS via `ktx-parse` — no WebGL required.
 *   The raw `levels[0].levelData` bytes are already RGBA8 (or need minor channel
 *   expansion); we map them to `DecodedImage` directly.
 *
 * • KTX2 *Basis-compressed* (VK_FORMAT_UNDEFINED / BasisLZ or UASTC supercompression):
 *   needs the Basis Universal WASM transcoder.  We create a tiny offscreen
 *   `WebGLRenderer`, call `KTX2Loader.detectSupport(renderer)`, parse the buffer,
 *   then do a render-to-canvas readback via `WebGLRenderTarget` +
 *   `readRenderTargetPixels`.
 *
 * • DDS: three's `DDSLoader.parse()` is a pure-JS parser that returns the pixel
 *   data directly.  For uncompressed DDS (ARGB/RGB layout → `RGBAFormat`), the
 *   pixels are already RGBA8 in `mipmaps[0].data` — no WebGL.  For compressed
 *   DDS (DXT1/3/5, BC6H, BC7, ETC1) we need a GPU readback.
 *
 * WebGL context handling
 * ──────────────────────
 * All GPU paths create a minimal `WebGLRenderer` on a 1×1 `OffscreenCanvas`,
 * upload the texture, render a full-screen quad to a `WebGLRenderTarget` at the
 * real texture dimensions, call `readRenderTargetPixels`, then dispose the
 * renderer.  If `OffscreenCanvas` / WebGL are unavailable (headless without
 * SwiftShader) the function throws a friendly error that becomes an error-toast
 * via the existing `persist.ts` try/catch.
 *
 * sRGB / linear
 * ─────────────
 * Albedo textures are sRGB; data maps (normal/roughness/AO) are linear.  Both
 * paths here decode to *raw* RGBA8 bytes and hand them to the existing WebP
 * re-encode path.  The channel role (albedo vs. data) is tracked by the upload
 * dialog and set as the material PBR slot — the runtime material loader applies
 * the correct `colorSpace` flag (SRGBColorSpace for albedo, NoColorSpace for
 * data).  We deliberately do NOT apply gamma correction here; that would corrupt
 * the raw pixel values that the loader later assigns a colour-space to.
 *
 * @module
 */

import type { CompressedPixelFormat } from 'three'
import {
  CompressedTexture,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { withBase } from '../../utils/assetUrl'
import type { DecodedImage } from './decodeImage'

// ─── Shared readback helper ───────────────────────────────────────────────────

/**
 * Create a minimal offscreen `WebGLRenderer` on a 1×1 `OffscreenCanvas`.
 * Throws if the platform doesn't support OffscreenCanvas or WebGL.
 */
function createOffscreenRenderer(): WebGLRenderer {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'GPU texture decode requires OffscreenCanvas (unavailable in this environment).',
    )
  }
  const canvas = new OffscreenCanvas(1, 1)
  const renderer = new WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    antialias: false,
  })
  if (!renderer.getContext()) {
    renderer.dispose()
    throw new Error('GPU texture decode requires WebGL (context creation failed).')
  }
  return renderer
}

/**
 * Render a texture to a `WebGLRenderTarget` and read back the RGBA8 pixels.
 * Disposes the render target resources when done.
 */
function readbackTexture(
  renderer: WebGLRenderer,
  texture: DataTexture | CompressedTexture,
  width: number,
  height: number,
): Uint8ClampedArray {
  const target = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    generateMipmaps: false,
  })

  const scene = new Scene()
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geo = new PlaneGeometry(2, 2)
  // The contract is byte-faithful readback: an sRGB-tagged source (KTX2Loader
  // sets it from the file's DFD) would be linearised at sample time and the
  // render target holds that linear value un-re-encoded, skewing every channel
  // (measured: 170 → 103 on the Basis teal fixture). Sample with no colour
  // transform — the downstream material loader owns the sRGB/linear tagging.
  texture.colorSpace = NoColorSpace
  const mat = new MeshBasicMaterial({ map: texture })
  scene.add(new Mesh(geo, mat))

  // updateStyle=false: the renderer runs on an OffscreenCanvas, which has no
  // `.style` — the default style write throws ("Cannot set properties of
  // undefined") and broke every Basis-KTX2/compressed-DDS upload.
  renderer.setSize(width, height, false)
  renderer.setRenderTarget(target)
  renderer.render(scene, camera)

  const pixels = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)

  // Clean up
  renderer.setRenderTarget(null)
  target.dispose()
  mat.dispose()
  geo.dispose()

  return new Uint8ClampedArray(pixels)
}

// ─── KTX2 ─────────────────────────────────────────────────────────────────────

// VK_FORMAT values that map to simple uncompressed RGBA8 / R8 / RG8 layouts —
// these can be decoded purely in JS via ktx-parse without a WebGL context.
const VK_FORMAT_R8G8B8A8_UNORM = 37
const VK_FORMAT_R8G8B8A8_SRGB = 43
const VK_FORMAT_R8G8_UNORM = 16
const VK_FORMAT_R8_UNORM = 9

/**
 * Decode a `.ktx2` buffer to RGBA8 pixels.
 *
 * Uncompressed formats (VK_FORMAT_R8G8B8A8_*, R8G8_UNORM, R8_UNORM): decoded
 * in JS via `ktx-parse` — no WebGL needed.
 *
 * Basis-compressed (VK_FORMAT_UNDEFINED): uses `KTX2Loader` + an offscreen
 * `WebGLRenderer`.  The Basis transcoder WASM must be reachable at `/basis/`
 * (copied to `public/basis/` at build time).
 */
export async function decodeKtx2(buffer: ArrayBuffer): Promise<DecodedImage> {
  const { read } = await import('ktx-parse')
  const container = read(new Uint8Array(buffer))
  const {
    pixelWidth: width,
    pixelHeight: height,
    vkFormat,
    levels,
    supercompressionScheme,
  } = container

  if (!width || !height || !levels.length) {
    throw new Error('KTX2: empty or zero-dimension texture.')
  }

  // ── Pure-JS path for uncompressed formats ──────────────────────────────────
  const isUncompressed =
    vkFormat === VK_FORMAT_R8G8B8A8_UNORM ||
    vkFormat === VK_FORMAT_R8G8B8A8_SRGB ||
    vkFormat === VK_FORMAT_R8G8_UNORM ||
    vkFormat === VK_FORMAT_R8_UNORM

  // KHR_SUPERCOMPRESSION_NONE = 0; BASISLZ = 1; ZSTD = 2
  const needsDecompression = supercompressionScheme !== 0

  if (isUncompressed && !needsDecompression) {
    const rawData = new Uint8Array(levels[0].levelData)

    if (vkFormat === VK_FORMAT_R8G8B8A8_UNORM || vkFormat === VK_FORMAT_R8G8B8A8_SRGB) {
      return { data: new Uint8ClampedArray(rawData), width, height }
    }

    // Expand R8 → RGBA8 (replicate to R/G/B, set A=255)
    if (vkFormat === VK_FORMAT_R8_UNORM) {
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4 + 0] = rawData[i]
        rgba[i * 4 + 1] = rawData[i]
        rgba[i * 4 + 2] = rawData[i]
        rgba[i * 4 + 3] = 255
      }
      return { data: rgba, width, height }
    }

    // Expand RG8 → RGBA8 (R in red, G in green, B=0, A=255)
    if (vkFormat === VK_FORMAT_R8G8_UNORM) {
      const rgba = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4 + 0] = rawData[i * 2 + 0]
        rgba[i * 4 + 1] = rawData[i * 2 + 1]
        rgba[i * 4 + 2] = 0
        rgba[i * 4 + 3] = 255
      }
      return { data: rgba, width, height }
    }
  }

  // ── WebGL path for Basis-compressed / other formats ────────────────────────
  // Covers VK_FORMAT_UNDEFINED (BasisLZ/UASTC), ZSTD supercompression, and
  // any other vkFormat not in the uncompressed fast-path above.
  const renderer = createOffscreenRenderer()
  try {
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
    const loader = new KTX2Loader()
    // Basis transcoder is self-hosted under public/basis/. Resolve against Vite's
    // `base` so it works in dev (/basis/) and under the prod sub-path
    // (/sofa-so-good/basis/) — a bare '/basis/' 404s on GitHub Pages.
    loader.setTranscoderPath(withBase('/basis/'))
    loader.detectSupport(renderer)

    // Wrap the callback-based parse() in a Promise
    const texture = await new Promise<DataTexture | CompressedTexture>((resolve, reject) => {
      try {
        // KTX2Loader.parse() uses onLoad/onError callbacks; the promise is not
        // returned from the method itself.
        ;(
          loader as unknown as {
            _createTexture(buf: ArrayBuffer): Promise<DataTexture | CompressedTexture>
          }
        )
          ._createTexture(buffer)
          .then(resolve)
          .catch(reject)
      } catch (e) {
        reject(e)
      }
    })

    const w = (texture as DataTexture).image?.width ?? width
    const h = (texture as DataTexture).image?.height ?? height

    // For DataTexture (uncompressed after transcode): data is in .image.data
    if (texture instanceof DataTexture && texture.image?.data) {
      const raw = texture.image.data as Uint8Array | Uint8ClampedArray
      loader.dispose()
      return { data: new Uint8ClampedArray(raw), width: w, height: h }
    }

    // For CompressedTexture: upload to GPU and readback
    const pixels = readbackTexture(renderer, texture as CompressedTexture, w, h)
    loader.dispose()
    return { data: pixels, width: w, height: h }
  } finally {
    renderer.dispose()
  }
}

// ─── DDS ──────────────────────────────────────────────────────────────────────

/**
 * Decode a `.dds` buffer to RGBA8 pixels.
 *
 * Uncompressed DDS (ARGB32 / RGB24 layouts → `RGBAFormat`): decoded purely in
 * JS by `DDSLoader.parse()` — no WebGL.  The loader already converts BGRA → RGBA
 * in `mipmaps[0].data`.
 *
 * Compressed DDS (DXT1/3/5, BC6H, BC7, ETC1): requires a GPU readback.
 */
export async function decodeDds(buffer: ArrayBuffer): Promise<DecodedImage> {
  const { DDSLoader } = await import('three/examples/jsm/loaders/DDSLoader.js')
  const loader = new DDSLoader()

  // DDSLoader.parse() returns the raw TexData without touching the DOM/GPU.
  // Cast because the type is CompressedTextureLoader's internal TexData shape.
  const dds = loader.parse(buffer, true) as unknown as {
    mipmaps: Array<{ data: Uint8Array; width: number; height: number }>
    width: number
    height: number
    format: number // three format enum value
    isCubemap: boolean
  }

  if (!dds.mipmaps.length) {
    throw new Error('DDS: no mipmap data found (invalid or unsupported DDS file).')
  }

  const { width, height } = dds
  const mip0 = dds.mipmaps[0]

  // RGBAFormat = three.js enum value 1023 — covers uncompressed ARGB/RGB
  // DDS paths where DDSLoader already produced straight RGBA8 bytes.
  if (dds.format === RGBAFormat) {
    return { data: new Uint8ClampedArray(mip0.data), width, height }
  }

  // Compressed format — need WebGL to decode.
  const renderer = createOffscreenRenderer()
  try {
    const texture = new CompressedTexture(
      dds.mipmaps,
      width,
      height,
      dds.format as CompressedPixelFormat,
      UnsignedByteType,
    )
    texture.needsUpdate = true
    // colorSpace is forced to NoColorSpace inside readbackTexture — the decode
    // contract is raw bytes; sRGB tagging happens downstream at material load.

    const pixels = readbackTexture(renderer, texture, width, height)
    texture.dispose()
    return { data: pixels, width, height }
  } finally {
    renderer.dispose()
  }
}
