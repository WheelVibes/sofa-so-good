/**
 * Graphics quality tiers. The baseline ('low'/'medium') is tuned to run
 * smoothly on integrated GPUs / CPU-class hardware: real-time sun shadows
 * and a one-shot procedural IBL probe, but no per-frame post-processing.
 * The 'high' tier layers on GPU-intensive effects (bloom + SMAA, higher
 * pixel ratio, more dynamic lights) for discrete GPUs.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  /** Sun shadow map resolution (px). 0 disables sun shadows. */
  shadowMapSize: number;
  /** Render the procedural image-based-lighting probe. */
  ibl: boolean;
  /** Run the post-processing stack (bloom + SMAA). GPU-intensive. */
  postprocessing: boolean;
  /** Max simultaneous furniture point lights at night. */
  maxFixtureLights: number;
  /** Upper device-pixel-ratio clamp. */
  dprMax: number;
  /** Fade exterior walls between camera and interior (cheap; always on). */
  wallReveal: boolean;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  low: {
    shadowMapSize: 1024,
    ibl: false,
    postprocessing: false,
    maxFixtureLights: 3,
    dprMax: 1,
    wallReveal: true,
  },
  medium: {
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: false,
    maxFixtureLights: 6,
    dprMax: 1.5,
    wallReveal: true,
  },
  high: {
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: true,
    maxFixtureLights: 8,
    dprMax: 2,
    wallReveal: true,
  },
};

export const QUALITY_LABEL: Record<QualityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Effective settings = the tier preset with any per-setting user overrides
 *  layered on top. */
export function resolveQuality(
  tier: QualityTier,
  overrides: Partial<QualitySettings> | undefined,
): QualitySettings {
  return { ...QUALITY_PRESETS[tier], ...(overrides ?? {}) };
}

/**
 * Pick a sensible starting tier for the current device. Conservative by
 * design: software / integrated renderers and low-core machines start at
 * low/medium; only clearly capable setups default to high.
 */
export function detectDefaultTier(gl?: WebGLRenderingContext | WebGL2RenderingContext): QualityTier {
  try {
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    let renderer = '';
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
    }
    const software = /swiftshader|software|llvmpipe|basic render/.test(renderer);
    const integrated = /intel|apple|mali|adreno|powervr|microsoft/.test(renderer);
    if (software || cores <= 2 || mem <= 2) return 'low';
    if (integrated || cores <= 4) return 'medium';
    return 'high';
  } catch {
    return 'medium';
  }
}
