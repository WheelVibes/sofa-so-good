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
    shadowMapSize: 0,
    ibl: false,
    postprocessing: false,
    maxFixtureLights: 2,
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
    shadowMapSize: 1024,
    ibl: true,
    postprocessing: false,
    maxFixtureLights: 6,
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
    shadowMapSize: 2048,
    ibl: true,
    postprocessing: true,
    maxFixtureLights: 8,
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
    shadowMapSize: 4096,
    ibl: true,
    postprocessing: true,
    maxFixtureLights: 12,
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
  medium: 'Sun shadows + soft reflections from a lighting probe. Good all-round default.',
  high: 'Adds ambient occlusion, filmic tone mapping & antialiasing — the most realistic everyday look. Auto-selected on Apple silicon and discrete GPUs.',
  maximum:
    'Cinematic — sharpest shadows, full-res ambient occlusion, film grain & optional lens depth-of-field. Never auto-selected; opt in on a strong GPU.',
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
  // Drop `undefined` override VALUES rather than spreading them (QUALITY-OVERRIDE-UNDEF).
  // `Partial<QualitySettings>` makes `{ shadowMapSize: undefined }` type-legal, and
  // spreading it OVERWRITES the preset with `undefined` instead of falling back to
  // it — which reads as "off", silently and catastrophically:
  // `castShadow={shadowMapSize > 0}` becomes `undefined > 0` = false (sun shadows
  // gone), `postprocessing: undefined` is falsy (no composer, hence no tone
  // mapping). It looks like a revert and behaves like a disable. This bit for real:
  // a probe used `setQualityOverride(key, undefined)` to mean "clear", so BOTH arms
  // of a shadow-on/off comparison ran with shadows off and the measured difference
  // was noise. `resetQualityOverrides()` is the way to clear; this guard makes the
  // mistake harmless if anyone reaches for the other one.
  const clean: Partial<QualitySettings> = {}
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (v !== undefined) (clean as Record<string, unknown>)[k] = v
  }
  return { ...preset, ...clean }
}

/**
 * How long after the scene first reports ready the adaptive FPS guard stays
 * quiet (ms).
 *
 * The guard samples only while the pump renders CONTINUOUSLY — and boot is
 * exactly that: the loader overlay, asset streaming, shader compilation and the
 * first shadow-map/IBL bakes all drive frames back to back, at the one moment
 * the app is least representative of steady-state cost. Before TIER-AUTODETECT
 * that never mattered (booting at Performance, there was no tier to step down
 * from). Booting at a detected tier, it mattered immediately: the M4 test machine
 * booted at High and the guard walked it straight down to Medium and then
 * Performance during warm-up, so capability detection looked like it wasn't
 * working at all. Wait for the scene to settle before believing a frame time.
 */
export const FPS_GUARD_WARMUP_MS = 5000

/**
 * Should the adaptive FPS guard trust frame times right now? Pure so the
 * warm-up rule is unit-testable without a renderer.
 *
 * @param sceneReady   the store's `sceneReady` flag
 * @param msSinceReady ms since `sceneReady` first turned true (0 if never)
 */
export function shouldSampleFps(sceneReady: boolean, msSinceReady: number): boolean {
  if (!sceneReady) return false
  return msSinceReady >= FPS_GUARD_WARMUP_MS
}

/**
 * Device capability signals that drive the boot tier. Plain data (no WebGL, no
 * DOM) so {@link tierForCapabilities} stays pure and unit-testable.
 */
export interface DeviceCapabilities {
  /** `WEBGL_debug_renderer_info`'s UNMASKED_RENDERER_WEBGL string, lowercased.
   *  `''` when the extension is unavailable (treated as "unknown", not "weak"). */
  renderer: string
  /** `navigator.hardwareConcurrency`. 0 when unknown. */
  cores: number
  /** Primary pointer is coarse — a phone or tablet. */
  coarsePointer: boolean
  /** A WebGL2 context is available. */
  webgl2: boolean
}

/** Software rasterisers. These report generous limits (SwiftShader advertises
 *  16K textures) but render single-digit FPS with shadows, so they must be
 *  matched by NAME rather than by any capability number. */
const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'softpipe', 'software', 'microsoft basic']

/**
 * Best-effort CEILING from device capabilities (TIER-AUTODETECT).
 *
 * Deliberately not the primary signal any more — `scene/adaptiveTier.ts` decides
 * the tier by MEASURING frames, because in a browser we cannot see the hardware:
 * `WEBGL_debug_renderer_info` is deprecated in Firefox and slated for removal,
 * disabled by `privacy.resistFingerprinting`, blockable, farbled by Brave, and
 * generic on Safari (every Apple device reports "Apple GPU"). This function's
 * only job is to keep the classes of device that must NEVER climb the ladder off
 * it, using signals that are cheap and mostly unrestricted:
 *
 *  - **Software rasteriser** → `performance`. Never mount shadows on a CPU
 *    renderer. Matched by NAME because these advertise generous limits
 *    (SwiftShader reports 16K textures) — the one place the renderer string is
 *    genuinely worth reading, and it fails safe when blocked.
 *  - **Coarse pointer (phone/tablet)** → `performance`. Thermals and fill rate
 *    bind on mobile, not peak capability, and a sustained-FPS probe is
 *    especially misleading there (a phone reads fast right up until it throttles).
 *  - **No WebGL2 / fewer than 4 cores** → `performance`. Old or constrained.
 *  - **Everything else** → `high`, i.e. "no opinion, let measurement decide".
 *
 * Returning `high` is NOT a claim that the device can run High — it is the
 * absence of a veto. The ladder still has to earn each rung.
 */
export function capabilityCeilingTier(caps: DeviceCapabilities): RenderTier {
  const r = caps.renderer.toLowerCase()
  if (SOFTWARE_RENDERERS.some((name) => r.includes(name))) return 'performance'
  if (caps.coarsePointer) return 'performance'
  if (!caps.webgl2) return 'performance'
  // `hardwareConcurrency` is 0/undefined on some privacy-hardened browsers —
  // only treat a POSITIVE, genuinely small value as weak.
  if (caps.cores > 0 && caps.cores < 4) return 'performance'
  return 'high'
}

/**
 * The tier to boot at on a FIRST visit, before anything has been measured.
 *
 * Conservative on purpose: `medium` is measurably free on capable hardware
 * (vsync-capped 60 fps, same as the flat tier) while already adding the two
 * things that matter most for materials — sun shadows and the IBL probe — and it
 * mounts no post stack, so there is no composer and no watchdog exposure. The
 * ladder probes upward from here; a repeat visitor skips this entirely and boots
 * at their persisted `autoMaxTier`.
 */
export function initialAutoTier(caps: DeviceCapabilities): RenderTier {
  const ceiling = capabilityCeilingTier(caps)
  return ceiling === 'performance' ? 'performance' : 'medium'
}

/** Read {@link DeviceCapabilities} from a live WebGL context + the browser.
 *  Every lookup is defensive: a blocked debug-renderer extension or a missing
 *  `matchMedia` must degrade to "unknown", never throw during boot. */
function readDeviceCapabilities(
  gl?: WebGLRenderingContext | WebGL2RenderingContext,
): DeviceCapabilities {
  let renderer = ''
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (ext && gl) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
  } catch {
    // Extension blocked (privacy mode / Firefox `resistFingerprinting`) — fall
    // through to the conservative "unknown renderer" path.
  }
  let coarsePointer = false
  try {
    coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches === true
  } catch {
    /* no matchMedia (SSR / test env) */
  }
  return {
    renderer,
    cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0,
    coarsePointer,
    // No context to inspect (the `resolveQuality` fallback path) resolves false,
    // which lands on the conservative tier — the intended safe default.
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
  }
}

/**
 * The starting render tier on boot for a device with no measured history
 * (TIER-AUTODETECT + TIER-ADAPTIVE). Called with no `gl` — the `resolveQuality`
 * fallback for an unrecognised persisted tier — it resolves to `'performance'`,
 * the safe floor.
 */
export function detectDefaultTier(gl?: WebGLRenderingContext | WebGL2RenderingContext): RenderTier {
  if (!gl) return 'performance'
  return initialAutoTier(readDeviceCapabilities(gl))
}

/** The capability ceiling for a live context — what the adaptive ladder may not
 *  climb past, regardless of measured frame rate. */
export function detectCapabilityCeiling(
  gl?: WebGLRenderingContext | WebGL2RenderingContext,
): RenderTier {
  if (!gl) return 'performance'
  return capabilityCeilingTier(readDeviceCapabilities(gl))
}
