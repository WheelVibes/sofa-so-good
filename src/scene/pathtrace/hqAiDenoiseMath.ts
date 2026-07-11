/**
 * Pure decision/format helpers for the HQ render's AI denoise pass
 * (PHOTO-DENOISE) — kept three.js/tf-free so they run in node unit tests.
 *
 * The heavy lifting lives in `hqAiDenoise.ts` (dynamic-imports the `denoiser`
 * package — an OIDN U-Net on tfjs) and `hqAovPasses.ts` (raster albedo/normal
 * guide passes); this module only decides *whether/how* to run.
 */

/** Upper input bound for the AI pass: 4K (3840×2160). Beyond that the U-Net's
 *  full-resolution RGBA readbacks + tensors (color + albedo + normal) cost
 *  hundreds of MB and minutes of inference — the 8K tier falls back to the
 *  edge-preserving blur instead. */
export const AI_DENOISE_MAX_PIXELS = 3840 * 2160

/** Can the AI denoiser take this output size? (Degenerate sizes excluded.) */
export function aiDenoiseEligible(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false
  if (width < 16 || height < 16) return false
  return width * height <= AI_DENOISE_MAX_PIXELS
}

/**
 * tfjs backend preference order for the denoiser: WebGPU when the browser
 * exposes it (fastest, closest to native OIDN), WebGL2 otherwise, with a CPU
 * last resort (headless/software-GL stacks where the tfjs WebGL backend fails
 * validation). Each entry is attempted in turn by `hqAiDenoise.ts`.
 */
export function denoiserBackendOrder(
  hasWebGpu: boolean,
): ReadonlyArray<'webgpu' | 'webgl' | 'cpu'> {
  return hasWebGpu ? ['webgpu', 'webgl', 'cpu'] : ['webgl', 'cpu']
}

/**
 * Absolute base URL of the self-hosted OIDN weights (`public/denoiser-tzas/`,
 * Apache-2.0 — see the LICENSE.txt shipped next to them). The library resolves
 * `<url>/<model>.tza` with `new URL(...)`, which rejects relative paths, so the
 * app base (`import.meta.env.BASE_URL`, e.g. `/` or `/sofa-so-good/`) is made
 * absolute against the page origin here. No trailing slash.
 */
export function denoiserWeightsUrl(baseUrl: string, pageHref: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL(`${base}denoiser-tzas`, pageHref).href
}
