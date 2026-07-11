/**
 * AI denoise pass for the HQ path-traced still (PHOTO-DENOISE): an OIDN U-Net
 * running in the browser via the `denoiser` package (DennisSmolek/Denoiser,
 * MIT — tfjs under the hood: WebGPU backend when the browser has it, WebGL2
 * otherwise, CPU as a last resort). Guided by the one-shot albedo + normal
 * AOV passes from `hqAovPasses.ts` for near-offline quality at 64–128 samples;
 * colour-only when the guides are unavailable.
 *
 * Weights are Intel's OIDN weights (Apache-2.0), self-hosted under
 * `public/denoiser-tzas/` (~0.6 MB per model + LICENSE.txt) so the pass works
 * offline/GH-Pages — the library's default jsDelivr CDN URL is never used.
 * Both the library (~1 MB gz, bundles tfjs) and the weights are lazy: nothing
 * loads until the first denoise actually runs.
 *
 * Everything here is failure-tolerant by contract: the caller (the HQ render
 * session) falls back to the edge-preserving `DenoiseMaterial` blur it already
 * applied when this throws.
 */

import { denoiserBackendOrder, denoiserWeightsUrl } from './hqAiDenoiseMath'
import type { HqAovImages } from './hqAovPasses'

/** How long to wait for a tfjs backend to come up before trying the next one.
 *  The library's backend init is fire-and-forget (a failed WebGPU/WebGL setup
 *  never rejects `execute()` — it just never flips `backendReady`). */
const BACKEND_READY_TIMEOUT_MS = 20_000

function waitForBackend(d: { backendReady: boolean }, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const poll = () => {
      if (d.backendReady) return resolve()
      if (performance.now() - started > timeoutMs)
        return reject(new Error('Denoiser backend never became ready'))
      setTimeout(poll, 50)
    }
    poll()
  })
}

/**
 * Run the OIDN denoise over the tracer's canvas. Returns the denoised frame as
 * ImageData (same top-down orientation as the canvas). Throws when every
 * backend fails — callers keep their edge-blur fallback.
 */
export async function runAiDenoise(
  color: HTMLCanvasElement,
  aov: HqAovImages | null,
  isCancelled: () => boolean = () => false,
): Promise<ImageData> {
  const { Denoiser } = await import('denoiser')
  const weightsUrl = denoiserWeightsUrl(import.meta.env.BASE_URL, window.location.href)
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  let lastError: unknown
  for (const backend of denoiserBackendOrder(hasWebGpu)) {
    if (isCancelled()) throw new Error('AI denoise cancelled')
    const denoiser = new Denoiser(backend)
    try {
      denoiser.weightsUrl = weightsUrl
      await waitForBackend(denoiser, BACKEND_READY_TIMEOUT_MS)
      // LDR tone-mapped canvas in, `fast` quality = the `_small` OIDN models
      // (the ones shipped in public/). Guides are clean raster AOVs, so the
      // library auto-selects the clean-aux model when both are present.
      denoiser.setInputImage('color', color)
      if (aov) {
        denoiser.setInputImage('albedo', aov.albedo, aov.flipY)
        denoiser.setInputImage('normal', aov.normal, aov.flipY)
      }
      const out = await denoiser.execute()
      if (isCancelled()) throw new Error('AI denoise cancelled')
      if (out instanceof ImageData) return out
      throw new Error('Denoiser returned an unexpected output type')
    } catch (err) {
      lastError = err
      if (import.meta.env.DEV) console.warn(`AI denoise failed on the ${backend} backend:`, err)
      if (isCancelled()) break
    } finally {
      try {
        denoiser.dispose()
      } catch {
        // tensors already gone
      }
    }
  }
  throw lastError ?? new Error('AI denoise failed')
}
