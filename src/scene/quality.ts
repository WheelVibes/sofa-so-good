/**
 * Graphics quality tiers.
 *
 * Two distinct tier axes — kept as separate types so they can't be confused:
 *
 *  - **RenderTier** (`performance | medium | high | maximum`) — the user-facing
 *    render-quality preset. `performance` is a deliberately *flat* renderer in
 *    the spirit of IKEA's web planner: no real-time shadows, no IBL, no
 *    post-processing, DPR 1 — it renders almost nothing per frame so it stays
 *    fluid on software / integrated GPUs and phones. `medium` adds sun shadows
 *    + an IBL probe; `high` layers on the GPU post stack (bloom + AO + SMAA);
 *    `maximum` pushes shadow resolution, DPR, light count and geometry detail
 *    to the ceiling for discrete GPUs.
 *  - **AssetTier** (`low | medium | high`) — GLB mesh/texture LOD, the values
 *    the offline `optimize:glb` pass and `gltf/lod.ts` key their `-low`/
 *    `-medium`/original variants on. Decoupled from the render tier (see
 *    `effectiveAssetTier`). `high` == the original, un-suffixed asset.
 */
export type RenderTier = 'performance' | 'medium' | 'high' | 'maximum'

/** GLB asset-LOD tier. `high` = original (no suffix). NOT the render tier. */
export type AssetTier = 'low' | 'medium' | 'high'

/** @deprecated Use {@link RenderTier} (render) or {@link AssetTier} (GLB LOD).
 *  Retained as an alias for the asset-LOD axis so `gltf/*` keep compiling. */
export type QualityTier = AssetTier

/** All render tiers, lowest → highest. Source of truth for ordering. */
export const RENDER_TIERS: RenderTier[] = ['performance', 'medium', 'high', 'maximum']

export interface QualitySettings {
  /** Sun shadow map resolution (px). 0 disables sun shadows. */
  shadowMapSize: number
  /** Render the procedural image-based-lighting probe. */
  ibl: boolean
  /** Run the post-processing stack (bloom + AO + SMAA). GPU-intensive. */
  postprocessing: boolean
  /** Max simultaneous furniture point lights at night. */
  maxFixtureLights: number
  /** Upper device-pixel-ratio clamp. */
  dprMax: number
  /** Fade exterior walls between camera and interior (cheap; always on). */
  wallReveal: boolean
  /** Soft contact-shadow blobs under furniture (cheap transparent overdraw, no
   *  shadow map). On at every tier — including the flat performance tier, where
   *  they are the only grounding cue — gated by the `contactShadows` feature
   *  flag (RZ1). */
  contactShadows: boolean
  /** Cheap baked wall/floor corner ambient-occlusion strips (`scene/CornerAO.tsx`).
   *  A substitute for SSAO on the GPU-light tiers — on for `performance`/`medium`
   *  (no post-processing AO), off from `high` up where the post stack already
   *  darkens corners (avoids double-darkening). Gated on top by the `cornerAo`
   *  feature flag. RD-403. */
  cornerAo: boolean
  /** Tessellation multiplier for furniture curved geometry (cylinders, lathes,
   *  rounded boxes). Scales segment counts so higher tiers render smoother
   *  legs/shades/vases while performance keeps polys down. 1 = baseline. */
  geometryDetail: number
  /** Accumulate soft, noise-free shadows while the camera is parked
   *  (drei AccumulativeShadows). Off on performance; forced on during capture. */
  showcase: boolean
  /** Render SSAO at full resolution instead of half-res — sharper, deeper
   *  contact darkening at a higher fill cost. Top tier only (needs `postprocessing`). */
  aoFullRes: boolean
  /** Cinematic finish — a faint film grain + subtle chromatic aberration in the
   *  post stack so stills read "photographed, not rendered". Top tier only. */
  cinematic: boolean
  /** Procedural IBL probe cubemap resolution (px). Higher = sharper reflections
   *  on glossy surfaces (glass/metal/varnish) at a one-time build cost. Only
   *  used when `ibl` is on. */
  envResolution: number
}

export const QUALITY_PRESETS: Record<RenderTier, QualitySettings> = {
  // Flat, IKEA-style: ambient + sun light only, no shadows / IBL / post. The
  // single biggest cost on a GPU-less laptop is real-time shadow mapping — this
  // tier renders without it and stays fluid.
  performance: {
    shadowMapSize: 0,
    ibl: false,
    postprocessing: false,
    maxFixtureLights: 2,
    dprMax: 1,
    wallReveal: true,
    // Cheap blob grounding (no shadow map) — the only contact cue on the flat
    // tier, so furniture doesn't look like it floats. RZ1.
    contactShadows: true,
    // Baked corner AO stands in for the SSAO this tier doesn't have (RD-403).
    cornerAo: true,
    geometryDetail: 0.7,
    showcase: false,
    aoFullRes: false,
    cinematic: false,
    envResolution: 64,
  },
  medium: {
    shadowMapSize: 1024,
    ibl: true,
    postprocessing: false,
    maxFixtureLights: 6,
    dprMax: 1.5,
    wallReveal: true,
    contactShadows: true,
    // Medium has sun shadows + IBL but no post-processing SSAO yet, so the
    // baked corner strips still help (RD-403).
    cornerAo: true,
    geometryDetail: 1,
    showcase: true,
    aoFullRes: false,
    cinematic: false,
    envResolution: 96,
  },
  high: {
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: true,
    maxFixtureLights: 8,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    // High+ run the post-processing SSAO pass, which darkens corners for real —
    // skip the baked strips to avoid double-darkening the junctions (RD-403).
    cornerAo: false,
    geometryDetail: 1.4,
    showcase: true,
    aoFullRes: false,
    cinematic: false,
    envResolution: 192,
  },
  maximum: {
    shadowMapSize: 4096,
    ibl: true,
    postprocessing: true,
    maxFixtureLights: 12,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    // Full post stack with full-res SSAO — baked corner strips off (RD-403).
    cornerAo: false,
    geometryDetail: 1.8,
    showcase: true,
    aoFullRes: true,
    cinematic: true,
    envResolution: 256,
  },
}

export const QUALITY_LABEL: Record<RenderTier, string> = {
  performance: 'Performance',
  medium: 'Medium',
  high: 'High',
  maximum: 'Maximum',
}

/** One-line description per tier for the Graphics panel. */
export const QUALITY_DESCRIPTION: Record<RenderTier, string> = {
  performance:
    'Flat & fast — soft contact grounding only, no real-time shadows or effects. Best for laptops/phones without a GPU.',
  medium: 'Sun shadows + soft reflections. Good all-round default.',
  high: 'Adds bloom, ambient occlusion & antialiasing. Needs a dedicated GPU.',
  maximum:
    'Cinematic — sharpest shadows, full-res ambient occlusion, film grain & subtle lens defocus. Strong GPUs only.',
}

/** Map a render tier to the asset-LOD tier it implies when asset quality is on
 *  "Auto". performance→low, medium→medium, high & maximum→original. */
export function renderToAssetTier(render: RenderTier): AssetTier {
  switch (render) {
    case 'performance':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
    case 'maximum':
      return 'high'
  }
}

/** Resolve the effective GLB asset tier (mesh/texture LOD), which is decoupled
 *  from the render quality tier. `null` means "Auto" — follow the render tier
 *  (via {@link renderToAssetTier}); an explicit tier pins asset detail
 *  independently (and is immune to the FPS auto-downgrade, which only mutates
 *  the render tier). */
export function effectiveAssetTier(assetTier: AssetTier | null, renderTier: RenderTier): AssetTier {
  return assetTier ?? renderToAssetTier(renderTier)
}

/** Effective settings = the tier preset with any per-setting user overrides
 *  layered on top. */
export function resolveQuality(
  tier: RenderTier,
  overrides: Partial<QualitySettings> | undefined,
): QualitySettings {
  return { ...QUALITY_PRESETS[tier], ...(overrides ?? {}) }
}

/**
 * The starting render tier on boot. By product decision this is ALWAYS
 * 'performance' — the flat, IKEA-style renderer — regardless of hardware, so
 * every user gets an instant, fluid first load. Higher tiers (shadows, IBL,
 * post-processing, maximum) are strictly opt-in from the Graphics panel.
 *
 * The `gl` argument is accepted (and ignored) so callers that pass the WebGL
 * context don't need to change; device capability no longer influences the
 * default.
 */
export function detectDefaultTier(
  _gl?: WebGLRenderingContext | WebGL2RenderingContext,
): RenderTier {
  return 'performance'
}
