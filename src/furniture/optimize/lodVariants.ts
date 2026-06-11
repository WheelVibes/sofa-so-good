import type { Document } from '@gltf-transform/core'
import { dedup, draco, prune, simplify, weld } from '@gltf-transform/functions'
import { LOD_TIERS, type LodTier, TIER_BUDGETS } from '../gltf/lod'
import { getIO, reencodeTexture } from './optimizeGlb'

/**
 * In-browser multi-tier LOD generation for uploaded models — the upload-path
 * mirror of the offline `optimize:glb` script (`python/scripts/
 * optimize_glb_lod.mjs`), which writes `-low`/`-medium` `.glb` siblings next to
 * each bundled/IKEA model. Here the siblings are produced from the already
 * optimized upload (WebP textures + Draco) and stored in IDB under derived
 * keys (`gltf/lod.ts` `lodAssetId`).
 *
 * Per tier (same recipe + budgets as the offline script — `TIER_BUDGETS` is the
 * shared source of truth):
 *   - textures re-encoded to WebP downscaled to the tier cap (512 / 1024 px)
 *   - weld → meshopt `simplify` at the tier triangle ratio (0.5 / 0.75,
 *     error 0.01) → dedup → prune → draco re-pack
 *
 * Worker-safe and best-effort at every level: a simplify failure degrades that
 *  tier to textures-only (the dominant VRAM win), a whole-tier failure omits
 *  the tier, and a total failure returns `{}` — LOD generation can never block
 *  or fail an upload.
 */

export interface LodTierParams {
  /** Longest-edge texture ceiling (px). */
  maxTextureSize: number
  /** Target triangle ratio for meshopt simplify. */
  simplifyRatio: number
  /** Simplify error tolerance — the gltf-transform default; tighter values
   *  barely decimate (see the offline script's note). */
  simplifyError: number
  /** WebP quality for the downscaled tier textures. Lossier than the base
   *  asset's near-lossless 0.95 — these render small/far. */
  webpQuality: number
}

/** Pure parameter table for a tier, derived from the shared TIER_BUDGETS. */
export function lodTierParams(tier: LodTier): LodTierParams {
  const budget = TIER_BUDGETS[tier]
  return {
    maxTextureSize: budget.maxTexture,
    simplifyRatio: budget.triangleRatio,
    simplifyError: 0.01,
    webpQuality: 0.85,
  }
}

/** Generated tier variants. A missing key means that tier failed (or input was
 *  unreadable) and the original asset serves that tier instead. */
export type LodVariantSet = Partial<Record<LodTier, Uint8Array>>

/** Downscale + re-encode every texture in `doc` to WebP at the tier cap.
 *  Unlike the base optimize pass this re-encodes WebP sources too (the input
 *  is the already-optimized GLB — the tier still needs the downscale); KTX2
 *  stays untouched (no browser decode path; existing TODO). */
async function downscaleTextures(doc: Document, params: LodTierParams): Promise<void> {
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage()
    const mime = tex.getMimeType()
    if (!img || !mime || mime === 'image/ktx2') continue
    const r = await reencodeTexture(img, mime, params.maxTextureSize, params.webpQuality)
    if (r) {
      tex.setImage(r.data)
      tex.setMimeType(r.mime)
    }
  }
}

async function makeVariant(input: Uint8Array, tier: LodTier): Promise<Uint8Array | null> {
  const params = lodTierParams(tier)
  const { io, draco: dracoOk } = await getIO()
  const build = async (withSimplify: boolean): Promise<Uint8Array> => {
    const doc = await io.readBinary(input)
    await downscaleTextures(doc, params)
    if (withSimplify) {
      // meshoptimizer ships pure JS + embedded wasm — dynamic import keeps it
      // out of the boot bundle alongside the rest of the optimize stack.
      const { MeshoptSimplifier } = await import('meshoptimizer')
      await MeshoptSimplifier.ready
      await doc.transform(
        weld(),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: params.simplifyRatio,
          error: params.simplifyError,
        }),
      )
    }
    await doc.transform(dedup(), prune())
    if (dracoOk) {
      try {
        await doc.transform(draco())
      } catch {
        // keep the un-Draco'd (still downscaled + simplified) document
      }
    }
    return io.writeBinary(doc)
  }
  try {
    return await build(true)
  } catch {
    // A malformed mesh can break simplify (mirrors the offline script): fall
    // back to a textures-only variant so the tier still ships its VRAM win.
    try {
      return await build(false)
    } catch {
      return null
    }
  }
}

/** Generate the `-low`/`-medium` siblings of an (already optimized) GLB.
 *  Never throws; tiers that fail are simply absent from the result. */
export async function generateLodVariants(input: Uint8Array): Promise<LodVariantSet> {
  const out: LodVariantSet = {}
  for (const tier of LOD_TIERS) {
    const data = await makeVariant(input, tier)
    // Only keep a variant that actually saves bytes — a tier that grew (tiny
    // models where the re-pack overhead dominates) would waste IDB space and
    // load time for nothing.
    if (data && data.byteLength < input.byteLength) out[tier] = data
  }
  return out
}
