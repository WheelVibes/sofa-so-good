import { runOptimize } from '../optimize/runOptimize'

export interface SaveOptimizeResult {
  /** The bytes to persist — the optimized GLB when it's smaller, else the raw. */
  data: Uint8Array
  beforeBytes: number
  afterBytes: number
  /** True when the optimized output was adopted (was strictly smaller). */
  optimized: boolean
}

/**
 * Route an exported designer GLB through the shared optimize pipeline
 * (`optimize/runOptimize` → weld/dedup/prune + Draco geometry pack + near-lossless
 * WebP texture re-encode, off the main thread) before persist — Asset Studio
 * Stage 6f.
 *
 * **Feature-safe**: the pass preserves every material feature the designer bakes —
 * KHR physical-material extensions (sheen/clearcoat/transmission/anisotropy),
 * multi-material primitives (Stage 6c per-face boxes), vertex-colour gradients
 * (Stage 2 COLOR_0), and embedded normal maps (Stage 6e wrinkles / decal
 * textures). Verified by `saveOptimize.test.ts` (the extension-registration fix
 * in `optimizeGlb.ts` is what makes the physical extensions survive the
 * gltf-transform read/write).
 *
 * **Keep-smaller guard**: procedural designer geometry is often tiny, where
 * Draco's per-primitive header overhead can make the packed GLB *larger* than the
 * raw export. So we adopt the optimized bytes ONLY when they're strictly smaller;
 * otherwise the raw export is persisted unchanged. The real win is the WebP
 * texture re-encode on assets carrying `mat:<id>` finishes / decal / wrinkle maps
 * (~50–70% of a textured asset's bytes). `runOptimize` never throws (best-effort);
 * on any failure it returns the input, so this can only ever shrink or no-op.
 */
export async function optimizeSavedGlb(raw: Uint8Array): Promise<SaveOptimizeResult> {
  const beforeBytes = raw.byteLength
  const { data } = await runOptimize(raw)
  if (data.byteLength < beforeBytes) {
    return { data, beforeBytes, afterBytes: data.byteLength, optimized: true }
  }
  return { data: raw, beforeBytes, afterBytes: beforeBytes, optimized: false }
}
