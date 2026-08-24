/**
 * Browser adapter for {@link analyzeDirection}: hand it a material's albedo and
 * get back whether that texture may be quarter-turned by the repetition
 * break-up. The measurement is per TEXTURE, so it covers every finish the app
 * can ever show — built-in patterns, composed/tinted variants, ambientCG and
 * Poly Haven scans, user uploads — with no per-material bookkeeping.
 *
 * The image is sampled down to `SAMPLE` px first: the verdict depends on the
 * pattern's structure, not its resolution, and a 64×64 read is ~4k pixels of
 * work once per texture (results are cached by texture uuid).
 *
 * Returns `null` — "could not measure" — rather than guessing when there is no
 * 2D context (SSR, node tests), the image has not decoded yet, or the canvas is
 * tainted by a cross-origin texture. Callers fall back to the conservative
 * static prior in `finishDirection.ts`.
 */

import type { MeshStandardMaterial, Texture } from 'three'
import { LruCache } from './materialLru'
import { analyzeDirection, type DirectionAnalysis, grayFromRgba } from './textureDirection'

/** Analysis resolution — enough structure, negligible cost. */
const SAMPLE = 64

/** Bounded so a long session browsing hundreds of finishes can't grow it
 *  without limit. Values are small plain objects; nothing to dispose. */
const CACHE = new LruCache<DirectionAnalysis | null>({ max: 512, dispose: () => {} })

/** Reused scratch canvas — one per session, not one per texture. */
let scratch:
  | { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D }
  | null
  | undefined

function getScratch() {
  if (scratch !== undefined) return scratch
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const ctx = new OffscreenCanvas(SAMPLE, SAMPLE).getContext('2d', { willReadFrequently: true })
      scratch = ctx ? { ctx } : null
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = SAMPLE
      c.height = SAMPLE
      const ctx = c.getContext('2d', { willReadFrequently: true })
      scratch = ctx ? { ctx } : null
    } else {
      scratch = null
    }
  } catch {
    scratch = null
  }
  return scratch
}

/** Measure one image source, or null when it cannot be read. */
export function analyzeImageDirection(source: CanvasImageSource): DirectionAnalysis | null {
  const s = getScratch()
  if (!s) return null
  try {
    s.ctx.clearRect(0, 0, SAMPLE, SAMPLE)
    s.ctx.drawImage(source as CanvasImageSource, 0, 0, SAMPLE, SAMPLE)
    const { data } = s.ctx.getImageData(0, 0, SAMPLE, SAMPLE)
    return analyzeDirection(grayFromRgba(data, SAMPLE, SAMPLE), SAMPLE, SAMPLE)
  } catch {
    // Tainted canvas / undecoded image / no GPU readback — measure nothing.
    return null
  }
}

/** Cached analysis for a texture, keyed by its uuid (stable per instance). */
export function analyzeTexture(tex: Texture | null | undefined): DirectionAnalysis | null {
  const image = tex?.image as CanvasImageSource | undefined
  if (!tex || !image) return null
  const hit = CACHE.get(tex.uuid)
  if (hit !== undefined) return hit
  const result = analyzeImageDirection(image)
  CACHE.set(tex.uuid, result)
  return result
}

/**
 * May the break-up quarter-turn cells of this material's surface?
 * `null` when the albedo could not be measured — the caller decides the
 * fallback (see `finishDirection.ts`).
 */
export function measuredQuarterTurnSafe(material?: MeshStandardMaterial | null): boolean | null {
  return analyzeTexture(material?.map)?.quarterTurnSafe ?? null
}

/** Test seam — drops the memoised verdicts. */
export function __resetTextureDirectionCache(): void {
  CACHE.clearForTest()
}
