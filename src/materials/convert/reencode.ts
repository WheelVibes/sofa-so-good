import { type DecodedImage, decodeImage } from './decodeImage'

/**
 * Re-encode decoded pixels to a near-lossless WebP File. WebP at quality 0.95 is
 * visually identical to the source while typically a fraction of a PNG's bytes —
 * "optimize as much as possible while keeping original quality" (codec-only; the
 * source resolution is preserved). KTX2/UASTC remains an opt-in follow-up.
 */
export async function reencodeToWebp(
  img: DecodedImage,
  name: string,
  quality = 0.95,
): Promise<File> {
  const canvas = new OffscreenCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  const imageData = ctx.createImageData(img.width, img.height)
  imageData.data.set(img.data)
  ctx.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
  const base = name.replace(/\.[a-z0-9]+$/i, '.webp')
  const ab = await blob.arrayBuffer()
  return new File([ab], base, { type: 'image/webp' })
}

/**
 * Normalize any supported image File to an optimized WebP File. WebP inputs pass
 * through untouched (already optimal); everything else (PNG/JPEG + the exotic
 * formats TGA/TIFF/BMP/EXR/HDR) is decoded and re-encoded to WebP.
 */
export async function normalizeTextureFile(file: File): Promise<File> {
  if (/\.webp$/i.test(file.name) || file.type === 'image/webp') return file
  const img = await decodeImage(file)
  return reencodeToWebp(img, file.name)
}
