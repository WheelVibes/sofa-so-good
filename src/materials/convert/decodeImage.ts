import { FloatType } from 'three'

// The TGA/EXR/HDR three loaders are dynamic-imported per format below so they
// stay out of the boot bundle — this module is reachable eagerly (texture
// upload validation), but the decoders only load when one is actually decoded.

/**
 * Decode any supported texture format to straight RGBA8 pixels. Formats the
 * browser handles natively (PNG/JPEG/WebP/BMP/GIF) go through createImageBitmap;
 * the rest are parsed by a three loader / UTIF and (for HDR/EXR) tonemapped to
 * 8-bit, since the material PBR slots (albedo/normal/rough/AO) are 8-bit.
 */
export interface DecodedImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

const extOf = (n: string): string => n.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''

/** Formats the browser decodes natively via createImageBitmap. */
const NATIVE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])
/** Extra formats we additionally decode via three/UTIF. */
export const EXTRA_TEXTURE_EXTENSIONS = ['.tga', '.tif', '.tiff', '.exr', '.hdr']

/** True when {@link decodeImage} can handle the file by name. */
export function isSupportedTexture(name: string): boolean {
  const e = extOf(name)
  return NATIVE.has(e) || EXTRA_TEXTURE_EXTENSIONS.includes(e)
}

async function viaBitmap(file: File): Promise<DecodedImage> {
  const bmp = await createImageBitmap(file)
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
    return { data: new Uint8ClampedArray(tex.data), width: tex.width, height: tex.height }
  }

  if (ext === '.tif' || ext === '.tiff') {
    const UTIF = (await import('utif')).default
    const ifds = UTIF.decode(buf)
    if (!ifds.length) throw new Error('TIFF has no images')
    UTIF.decodeImage(buf, ifds[0])
    const rgba = UTIF.toRGBA8(ifds[0])
    return { data: new Uint8ClampedArray(rgba), width: ifds[0].width, height: ifds[0].height }
  }

  if (ext === '.exr') {
    const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js')
    const loader = new EXRLoader()
    loader.setDataType(FloatType)
    const tex = loader.parse(buf) as { data: ArrayLike<number>; width: number; height: number }
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
    return {
      data: floatToRgba(tex.data, tex.width, tex.height),
      width: tex.width,
      height: tex.height,
    }
  }

  throw new Error(`Unsupported texture format: ${file.name}`)
}
