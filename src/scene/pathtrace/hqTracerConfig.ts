/**
 * Path-tracer quality tuning (PHOTO-PT-TUNE) for the HQ render session. Pure data
 * so it's unit-testable; applied to the `WebGLPathTracer` in `hqRenderSession.ts`
 * right after construction (before `setScene`, so the material/uniform changes
 * take effect on the first sample).
 *
 * The library defaults are tuned for speed, not interiors: too few transmissive
 * bounces leave **glass black/opaque**, and unfiltered glossy rays let
 * **sun-through-glass fireflies** (bright speckles) through. These values fix
 * both while keeping convergence reasonable (the sample count is the user's
 * time↔quality dial — see `HqRenderModal` `SAMPLE_STEPS`).
 */

export interface HqTracerConfig {
  /** Total light-path bounce depth (diffuse/specular). */
  bounces: number
  /** Bounces budgeted for transmission (glass/water). Too few → black/opaque
   *  glass. Kept ≤ `bounces`. */
  transmissiveBounces: number
  /** Glossy-ray firefly suppression in [0,1]: higher clamps more of the bright
   *  speckles from sharp highlights (e.g. sun through a window). */
  filterGlossyFactor: number
  /** Multiple importance sampling — markedly faster convergence on lit surfaces. */
  multipleImportanceSampling: boolean
  /** Stable (deterministic) noise across samples — the speckle pattern doesn't
   *  swim frame-to-frame as the still accumulates, so the converging image reads
   *  cleaner and a captured frame mid-convergence isn't visibly dithered. Best
   *  for a progressive still (vs. an animation). */
  stableNoise: boolean
}

export const HQ_TRACER_CONFIG: HqTracerConfig = {
  bounces: 10,
  transmissiveBounces: 6,
  filterGlossyFactor: 0.75,
  multipleImportanceSampling: true,
  stableNoise: true,
}
