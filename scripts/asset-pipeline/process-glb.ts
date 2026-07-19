import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { KHRTextureBasisu } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import { ktx2 } from './ktx2-encode'

export interface ProcessGlbOptions {
  /** When true, run Draco geometry compression. When false, just copy. */
  compress: boolean
  /**
   * When true, re-encode eligible textures to KTX2/UASTC (GPU-compressed in
   * VRAM) via the build-time WASM encoder. Opt-in — it's CPU-heavy and off by
   * default. Degrades to a no-op (source textures kept) when the encoder is
   * unavailable, so it never breaks the offline build. See `ktx2-encode.ts`.
   */
  ktx2?: boolean
}

// KHRTextureBasisu registered so the writer can serialise KTX2 textures.
const io = new NodeIO().registerExtensions([KHRTextureBasisu])

export async function processGlb(
  inputPath: string,
  outputPath: string,
  opts: ProcessGlbOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true })
  if (!opts.compress && !opts.ktx2) {
    copyFileSync(inputPath, outputPath)
    return
  }
  const doc = await io.read(inputPath)
  if (opts.ktx2) {
    try {
      await doc.transform(ktx2())
    } catch (err) {
      // Never let texture compression abort the build — keep the source
      // textures and continue (matches the draco fallback below).
      console.warn(`ktx2 encode failed for ${inputPath}: ${(err as Error).message}`)
    }
  }
  if (opts.compress) {
    try {
      await doc.transform(draco())
    } catch (err) {
      // Draco encoder may be unavailable in some environments. Fall back to
      // a plain re-write so the rest of the pipeline still produces an output.
      console.warn(`draco compression failed for ${inputPath}: ${(err as Error).message}`)
    }
  }
  await io.write(outputPath, doc)
}

export async function deriveBoundingBox(
  glbPath: string,
): Promise<{ w: number; d: number; h: number }> {
  const doc = await io.read(glbPath)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  if (!scene) throw new Error(`No scene in ${glbPath}`)
  const bounds = getBounds(scene)
  return {
    w: Math.max(bounds.max[0] - bounds.min[0], 0.001),
    h: Math.max(bounds.max[1] - bounds.min[1], 0.001),
    d: Math.max(bounds.max[2] - bounds.min[2], 0.001),
  }
}
