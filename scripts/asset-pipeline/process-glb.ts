import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getBounds, NodeIO } from '@gltf-transform/core'
import { draco } from '@gltf-transform/functions'

export interface ProcessGlbOptions {
  /** When true, run Draco geometry compression. When false, just copy. */
  compress: boolean
}

const io = new NodeIO()

export async function processGlb(
  inputPath: string,
  outputPath: string,
  opts: ProcessGlbOptions,
): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true })
  if (!opts.compress) {
    copyFileSync(inputPath, outputPath)
    return
  }
  const doc = await io.read(inputPath)
  try {
    await doc.transform(draco())
  } catch (err) {
    // Draco encoder may be unavailable in some environments. Fall back to
    // a plain re-write so the rest of the pipeline still produces an output.
    console.warn(`draco compression failed for ${inputPath}: ${(err as Error).message}`)
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
