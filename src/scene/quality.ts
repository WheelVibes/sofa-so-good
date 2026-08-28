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
  /** Merge fixtures that sit within 1.0 m of each other and are the same kind
   *  into one light (`lighting/fixtureLights.ts:aggregateFixtureLights`). Every
   *  point light costs a full GGX BRDF per fragment.
   *
   *  ON AT EVERY TIER. It was originally gated to Performance/Medium to keep
   *  High/Maximum "exactly as authored" — but the profiler on real hardware
   *  says the opposite of what that assumed: Performance renders the whole
   *  scene in ~3 ms with 5x headroom and no measurable light cost, while
   *  Maximum spends 9.75 ms of a 32 ms frame on fixture lights (30%, and it
   *  misses 60 fps). The saving is needed precisely where it was switched off,
   *  and the merge rule is conservative enough by construction (same def, same
   *  bulb colour, within 1.0 m) that there is no fidelity argument for
   *  withholding it. Kept as a setting so the profiler can still A/B it. */
  mergeCoincidentLights: boolean
  /** Upper device-pixel-ratio clamp. */
  dprMax: number
  /** Fade exterior walls between camera and interior (cheap; always on). */
  wallReveal: boolean
  /** Soft contact-shadow blobs under furniture (cheap transparent overdraw, no
   *  shadow map). On at every tier — including the flat performance tier, where
   *  they are the only grounding cue — gated by the `contactShadows` feature
   *  flag (RZ1). */
  contactShadows: boolean
  /** Tessellation multiplier for furniture curved geometry (cylinders, lathes,
   *  rounded boxes). Scales segment counts so higher tiers render smoother
   *  legs/shades/vases while performance keeps polys down. 1 = baseline. */
  geometryDetail: number
  /** Retired (RD-410). Previously mounted a drei `AccumulativeShadows` ground
   *  plane while the camera was parked. For a full apartment (which has its own
   *  floor + real PCF sun shadows + contact shadows) that 19 m catcher rendered
   *  the building's silhouette as a large dark rectangle on the ground, bigger
   *  than the footprint — the reported artifact. Kept in the type (so the flag
   *  map + settle-tail signature stay stable) but `false` on every tier; the
   *  controller no longer renders the plane. */
  showcase: boolean
  /** Render SSAO at full resolution instead of half-res — sharper, deeper
   *  contact darkening at a higher fill cost. Top tier only (needs `postprocessing`). */
  aoFullRes: boolean
  /** Cinematic finish — a faint film grain + subtle chromatic aberration in the
   *  post stack so stills read "photographed, not rendered". Top tier only. */
  cinematic: boolean
  /** Raster depth-of-field (`@react-three/postprocessing` `<DepthOfField>`).
   *  **True only on `high`/`maximum`** — DoF needs the post stack, which only
   *  mounts when `postprocessing` is on (structurally impossible on
   *  performance/medium). Gated on top by the `cameraDof` feature flag + the
   *  user's f-stop (off when 0). World-space focus is shared with the HQ path
   *  tracer (metres). PC2-CAM-DOF-LENS. */
  dof: boolean
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
    mergeCoincidentLights: true,
    shadowMapSize: 0,
    ibl: false,
    postprocessing: false,
    dprMax: 1,
    wallReveal: true,
    // Cheap blob grounding (no shadow map) — the only contact cue on the flat
    // tier, so furniture doesn't look like it floats. RZ1.
    contactShadows: true,
    geometryDetail: 0.7,
    showcase: false,
    aoFullRes: false,
    cinematic: false,
    // No post stack on the flat tier → DoF structurally impossible.
    dof: false,
    envResolution: 64,
  },
  medium: {
    mergeCoincidentLights: true,
    shadowMapSize: 1024,
    ibl: true,
    postprocessing: false,
    dprMax: 1.5,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1,
    showcase: false, // RD-410: accumulator retired (oversized dark-rectangle artifact)
    aoFullRes: false,
    cinematic: false,
    // Medium has no post-processing → no DoF.
    dof: false,
    envResolution: 96,
  },
  high: {
    mergeCoincidentLights: true,
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: true,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1.4,
    showcase: false, // RD-410: accumulator retired (oversized dark-rectangle artifact)
    aoFullRes: false,
    cinematic: false,
    // High runs the post stack → DoF available (gated by flag + user f-stop).
    dof: true,
    envResolution: 192,
  },
  maximum: {
    mergeCoincidentLights: true,
    shadowMapSize: 4096,
    ibl: true,
    postprocessing: true,
    dprMax: 2,
    wallReveal: true,
    contactShadows: true,
    geometryDetail: 1.8,
    showcase: false, // RD-410: accumulator retired (oversized dark-rectangle artifact)
    aoFullRes: true,
    cinematic: true,
    // Full post stack → DoF available (gated by flag + user f-stop).
    dof: true,
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
    'Cinematic — sharpest shadows, full-res ambient occlusion, film grain & optional lens depth-of-field. Strong GPUs only.',
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
  // Fall back rather than spreading `undefined`. `qualityTier` is PERSISTED, so
  // a value written by an older build (or any tier since renamed/retired) would
  // otherwise resolve to a settings object with every field `undefined` — and
  // that fails silently and spectacularly: `seg(28, undefined)` is
  // `Math.round(NaN)` → NaN, and a geometry built with NaN segments renders
  // nothing at all. A lamp keeps its pole and loses its shade, with no error
  // anywhere. Diagnosed while auditing (Chrome audit 2026-08).
  const preset = QUALITY_PRESETS[tier] ?? QUALITY_PRESETS[detectDefaultTier()]
  return { ...preset, ...(overrides ?? {}) }
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
