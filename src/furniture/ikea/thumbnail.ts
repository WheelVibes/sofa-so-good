/** Compute target dimensions so the longest edge is <= maxEdge, preserving
 *  aspect ratio. Never upscales. Pure — unit-tested without a canvas. */
export function fitDimensions(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { w, h }
  const scale = maxEdge / longest
  return { w: Math.round(w * scale), h: Math.round(h * scale) }
}

/** Downscale an image File to a thumbnail Blob whose longest edge is
 *  <= maxEdge (default 256). Decodes via createImageBitmap, draws to a
 *  canvas, and exports WebP (q=0.8). Resolves to the original file's blob
 *  if the browser image APIs are unavailable (e.g. jsdom) so callers can
 *  treat it as best-effort. */
export async function downscaleImageFile(file: File, maxEdge = 256): Promise<Blob> {
  if (
    typeof createImageBitmap !== 'function' ||
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return file
  }
  const bitmap = await createImageBitmap(file)
  const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.8),
  )
  return blob ?? file
}
