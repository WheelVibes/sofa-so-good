import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

export interface ProcessTextureOptions {
  /** Max edge length in pixels. Sources larger than this are downscaled. */
  maxSize: number;
}

/**
 * Resizes an image to fit within `maxSize` on its longest edge and
 * writes it to `outputPath`, preserving the source format (JPG → JPG,
 * PNG → PNG). KTX2 compression is intentionally not implemented here —
 * see TODO.md for the follow-up that adds a proper encoder integration.
 */
export async function processTexture(
  inputPath: string,
  outputPath: string,
  opts: ProcessTextureOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const meta = await sharp(inputPath).metadata();
  const w = meta.width ?? opts.maxSize;
  const h = meta.height ?? opts.maxSize;
  const longest = Math.max(w, h);
  let pipeline = sharp(inputPath);
  if (longest > opts.maxSize) {
    pipeline =
      w >= h
        ? pipeline.resize({ width: opts.maxSize })
        : pipeline.resize({ height: opts.maxSize });
  }
  const lower = inputPath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
  } else {
    await pipeline.png().toFile(outputPath);
  }
}
