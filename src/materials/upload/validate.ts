/**
 * Pure validators for user-uploaded material textures. Each image is
 * decoded via createImageBitmap so we know the file is a real image
 * before writing it to IndexedDB.
 *
 * Limits chosen to keep the IDB footprint reasonable: max 4096×4096
 * per channel, max 8 MB per file. Albedo is required; normal,
 * roughness, and ao are optional.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_DIM = 4096

export type ValidateResult =
  | { ok: true; mime: string; width: number; height: number }
  | { ok: false; reason: string }

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function validateImageFile(file: File): Promise<ValidateResult> {
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `Image too large (${(file.size / 1_048_576).toFixed(1)} MB > ${MAX_IMAGE_BYTES / 1_048_576} MB).`,
    }
  }
  if (!ACCEPTED_MIME.has(file.type)) {
    return {
      ok: false,
      reason: `Unsupported image type '${file.type || 'unknown'}'. Use PNG, JPG, or WebP.`,
    }
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ok: false, reason: 'Image failed to decode.' }
  }
  const { width, height } = bitmap
  bitmap.close()
  if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
    return {
      ok: false,
      reason: `Image is ${width}×${height}; max is ${MAX_IMAGE_DIM}².`,
    }
  }
  return { ok: true, mime: file.type, width, height }
}
