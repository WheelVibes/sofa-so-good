import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import sharp from 'sharp'

export interface ProcessTextureOptions {
  /** Max edge length in pixels. Sources larger than this are downscaled. */
  maxSize: number
}

/**
 * Resizes an image to fit within `maxSize` on its longest edge and
 * writes it to `outputPath`, preserving the source format (JPG → JPG,
 * PNG → PNG). KTX2 is intentionally NOT emitted here: these are standalone
 * *material* textures, loaded at runtime by drei's `useTexture`
 * (`src/materials/useMaterial.ts`), which only decodes raster formats — the
 * material pipeline actually transcodes uploaded KTX2 back to WebP
 * (`src/materials/convert/decodeGpuTexture.ts`). KTX2/UASTC applies to *GLB*
 * textures via `KHR_texture_basisu` (the renderer-bound KTX2Loader decodes
 * those); the build-time encoder lives in `ktx2-encode.ts` and is wired into
 * `process-glb.ts` (opt-in `{ ktx2: true }`).
 */
export async function processTexture(
  inputPath: string,
  outputPath: string,
  opts: ProcessTextureOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true })
  const meta = await sharp(inputPath).metadata()
  const w = meta.width ?? opts.maxSize
  const h = meta.height ?? opts.maxSize
  const longest = Math.max(w, h)
  let pipeline = sharp(inputPath)
  if (longest > opts.maxSize) {
    pipeline =
      w >= h ? pipeline.resize({ width: opts.maxSize }) : pipeline.resize({ height: opts.maxSize })
  }
  const lower = inputPath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    await pipeline.jpeg({ quality: 90 }).toFile(outputPath)
  } else {
    await pipeline.png().toFile(outputPath)
  }
}
