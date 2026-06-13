import { FloatType } from 'three'

// The TGA/EXR/HDR three loaders are dynamic-imported per format below so they
// stay out of the boot bundle — this module is reachable eagerly (texture
// upload validation), but the decoders only load when one is actually decoded.

/**
 * Decode any supported texture format to straight RGBA8 pixels. Formats the
 * browser handles natively (PNG/JPEG/WebP/BMP/GIF) go through createImageBitmap;
 * the rest are parsed by a three loader / UTIF and (for HDR/EXR) tonemapped to
 * 8-bit, since the material PBR slots (albedo/normal/rough/AO) are 8-bit.
 *
 * KTX2 and DDS are GPU-compressed formats handled via a WebGL readback path
 * in `decodeGpuTexture.ts`.  They are listed in EXTRA_TEXTURE_EXTENSIONS so
 * the extension gate accepts them; the actual decode is delegated there.
 */
export interface DecodedImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * Hard ceiling on decoded pixel dimensions. A source file can be a few KB on
 * disk yet declare enormous dimensions (a PNG/TIFF/EXR "decompression bomb");
 * decoding it allocates width·height·4 bytes of RGBA (and the float formats far
 * more), which can OOM-crash the tab before the post-decode storage validator
 * (`upload/validate.ts` `MAX_IMAGE_DIM`) ever runs. We reject *before* that
 * allocation. The cap matches the storage limit, so an over-size image — which
 * the validator would reject anyway — is now rejected cheaply instead of after a
 * dangerous full decode (no currently-accepted input is lost).
 */
export const MAX_DECODE_DIM = 4096

/** Throw if dimensions are non-positive, non-finite, or exceed {@link MAX_DECODE_DIM}. */
export function assertDecodable(width: number, height: number): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_DECODE_DIM ||
    height > MAX_DECODE_DIM
  ) {
    throw new Error(`Image is ${width}×${height}; max decodable is ${MAX_DECODE_DIM}².`)
  }
}

/**
 * Read intrinsic pixel dimensions from a PNG or JPEG header *without* decoding
 * the pixels, so a decompression bomb can be rejected before any large
 * allocation. Returns `null` for formats we don't header-probe (the caller then
 * falls back to the decoder's reported dimensions, still capped post-decode).
 * Pure + dependency-free for unit testing.
 */
export function readImageHeaderDims(buf: ArrayBuffer): { width: number; height: number } | null {
  const b = new Uint8Array(buf)
  // PNG: 8-byte signature, then the IHDR chunk — width@16, height@20 (BE uint32).
  if (
    b.length >= 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    const dv = new DataView(buf)
    return { width: dv.getUint32(16), height: dv.getUint32(20) }
  }
  // JPEG: SOI (FFD8) then segments; a Start-Of-Frame marker carries the size.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    const dv = new DataView(buf)
    let off = 2
    while (off + 9 <= b.length) {
      if (b[off] !== 0xff) {
        off++
        continue
      }
      const marker = b[off + 1]
      // Standalone markers (no length): padding (FF), SOI/EOI, restart markers.
      if (
        marker === 0xff ||
        marker === 0xd8 ||
        marker === 0xd9 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        off += 2
        continue
      }
      const len = dv.getUint16(off + 2)
      if (len < 2) break
      // SOF0–SOF15 (baseline/progressive/etc.), excluding the non-SOF C4/C8/CC.
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return { height: dv.getUint16(off + 5), width: dv.getUint16(off + 7) }
      }
      off += 2 + len
    }
  }
  return null
}

const extOf = (n: string): string => n.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''

/** Formats the browser decodes natively via createImageBitmap. */
const NATIVE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])
/**
 * Extra formats we decode via three loaders / UTIF / ktx-parse.
 *
 * KTX2 and DDS are listed here so the extension gate in {@link isSupportedTexture}
 * accepts them; their decode is handled by `decodeGpuTexture.ts` which uses a
 * WebGL render-to-canvas readback (or a pure-JS path for uncompressed KTX2).
 */
export const EXTRA_TEXTURE_EXTENSIONS = ['.tga', '.tif', '.tiff', '.exr', '.hdr', '.ktx2', '.dds']

/** True when {@link decodeImage} can handle the file by name. */
export function isSupportedTexture(name: string): boolean {
  const e = extOf(name)
  return NATIVE.has(e) || EXTRA_TEXTURE_EXTENSIONS.includes(e)
}

async function viaBitmap(file: File): Promise<DecodedImage> {
  // Reject decompression bombs from the header *before* createImageBitmap +
  // getImageData allocate width·height·4 bytes of RGBA.
  const headerDims = readImageHeaderDims(await file.arrayBuffer())
  if (headerDims) assertDecodable(headerDims.width, headerDims.height)
  const bmp = await createImageBitmap(file)
  try {
    assertDecodable(bmp.width, bmp.height)
  } catch (e) {
    bmp.close()
    throw e
  }
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    throw new Error('2D canvas unavailable')
  }
  ctx.drawImage(bmp, 0, 0)
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height)
  bmp.close()
  return { data: img.data, width: img.width, height: img.height }
}

/** Reinhard tonemap + gamma encode float HDR pixels → 8-bit RGBA. */
function floatToRgba(src: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const s = i * 4
    for (let c = 0; c < 3; c++) {
      const v = Math.max(0, src[s + c] ?? 0)
      out[p + c] = Math.round(255 * (v / (1 + v)) ** (1 / 2.2))
    }
    out[p + 3] = Math.round(255 * Math.min(1, Math.max(0, src[s + 3] ?? 1)))
  }
  return out
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  const ext = extOf(file.name)
  if (NATIVE.has(ext)) return viaBitmap(file)
  const buf = await file.arrayBuffer()

  if (ext === '.tga') {
    const { TGALoader } = await import('three/examples/jsm/loaders/TGALoader.js')
    // three 0.184 TGALoader extends DataTextureLoader; parse() returns the raw
    // texture data object { data: Uint8Array(RGBA), width, height } directly.
    const tex = new TGALoader().parse(buf) as unknown as {
      data: Uint8Array
      width: number
      height: number
    }
    assertDecodable(tex.width, tex.height)
    return { data: new Uint8ClampedArray(tex.data), width: tex.width, height: tex.height }
  }

  if (ext === '.tif' || ext === '.tiff') {
    const UTIF = (await import('utif')).default
    const ifds = UTIF.decode(buf)
    if (!ifds.length) throw new Error('TIFF has no images')
    // IFD dimensions are read cheaply by decode(); reject a bomb before the
    // heavy decodeImage()/toRGBA8() pixel allocation.
    assertDecodable(ifds[0].width, ifds[0].height)
    UTIF.decodeImage(buf, ifds[0])
    const rgba = UTIF.toRGBA8(ifds[0])
    return { data: new Uint8ClampedArray(rgba), width: ifds[0].width, height: ifds[0].height }
  }

  if (ext === '.exr') {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js')
    const loader = new EXRLoader()
    loader.setDataType(FloatType)
    const tex = loader.parse(buf) as { data: ArrayLike<number>; width: number; height: number }
    assertDecodable(tex.width, tex.height)
    return {
      data: floatToRgba(tex.data, tex.width, tex.height),
      width: tex.width,
      height: tex.height,
    }
  }

  if (ext === '.hdr') {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js')
    const loader = new RGBELoader()
    loader.setDataType(FloatType)
    const tex = loader.parse(buf) as { data: ArrayLike<number>; width: number; height: number }
    assertDecodable(tex.width, tex.height)
    return {
      data: floatToRgba(tex.data, tex.width, tex.height),
      width: tex.width,
      height: tex.height,
    }
  }

  if (ext === '.ktx2') {
    const { decodeKtx2 } = await import('./decodeGpuTexture')
    return decodeKtx2(buf)
  }

  if (ext === '.dds') {
    const { decodeDds } = await import('./decodeGpuTexture')
    return decodeDds(buf)
  }

  throw new Error(`Unsupported texture format: ${file.name}`)
}
