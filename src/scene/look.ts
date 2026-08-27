/**
 * Single source of truth for the graded "look". Pure functions only — no
 * three.js, no React — so the curves are unit-testable. Consumers (Lighting,
 * EffectsImpl) read these to drive exposure, white balance, shadow softness
 * and ambient occlusion. `altitude` is the sun altitude in radians as
 * returned by SunCalc (negative below the horizon, ~1.57 at zenith).
 */

import type { RenderTier } from './quality'

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

export interface Grade {
  /** Multiplier for gl.toneMappingExposure. */
  exposure: number
  /** 0 = neutral midday, 1 = warmest golden-hour/indoor-night cast. */
  warmth: number
}

/**
 * Tone-mapping "look" (view transform) the user can pick in the Graphics panel.
 * Pure string union here (no three.js, so `look.ts` stays unit-testable); the
 * renderer maps it to a three `ToneMapping` constant via `TONE_MAPPING_THREE`
 * in `Scene`/`Lighting`.
 *
 *  - `filmic`  — ACES Filmic. Punchy, slightly contrasty; the long-standing
 *    default, so it stays the default (no regression).
 *  - `agx`     — AgX. Gentler highlight roll-off + better hue stability in
 *    bright areas (the modern Blender-4 standard); reads more "photographic".
 *  - `neutral` — Khronos PBR Neutral. Minimal shift, preserves material albedo
 *    — best for true-to-catalogue product/showroom colour.
 */
export type ToneMappingMode = 'filmic' | 'agx' | 'neutral'

export const TONE_MAPPING_MODES: ToneMappingMode[] = ['filmic', 'agx', 'neutral']

export const DEFAULT_TONE_MAPPING: ToneMappingMode = 'filmic'

export const TONE_MAPPING_LABEL: Record<ToneMappingMode, string> = {
  filmic: 'Filmic',
  agx: 'AgX',
  neutral: 'Neutral',
}

/** User exposure (brightness) multiplier applied on top of the altitude-driven
 *  auto-exposure — like a camera's exposure-compensation dial. 1 = neutral. */
export const DEFAULT_EXPOSURE = 1
export const EXPOSURE_MIN = 0.6
export const EXPOSURE_MAX = 1.6

/** Clamp a user exposure multiplier to the supported range (defensive against a
 *  hand-edited pref). */
export function clampExposure(x: number): number {
  if (!Number.isFinite(x)) return DEFAULT_EXPOSURE
  return Math.min(EXPOSURE_MAX, Math.max(EXPOSURE_MIN, x))
}

/**
 * Scene colour-grade knobs (COLOR-GRADE) — user dials so the graded look can be
 * pushed warmer/cooler and more/less saturated (e.g. back toward the greyish
 * pre-calibration read) without touching materials. Both persist per-device
 * (qualityPrefs) beside `exposure`/`toneMapping`.
 */

/** White-balance bias: -1 = coolest, 0 = neutral (default), +1 = warmest. */
export const DEFAULT_SCENE_WARMTH = 0
export const SCENE_WARMTH_MIN = -1
export const SCENE_WARMTH_MAX = 1

export function clampSceneWarmth(x: number): number {
  if (!Number.isFinite(x)) return DEFAULT_SCENE_WARMTH
  return Math.min(SCENE_WARMTH_MAX, Math.max(SCENE_WARMTH_MIN, x))
}

/** Scene saturation multiplier: 0 = monochrome-ish, 1 = default, 2 = vivid.
 *  Drives the High/Maximum post stack's HueSaturation pass. */
export const DEFAULT_SCENE_SATURATION = 1
export const SCENE_SATURATION_MIN = 0
export const SCENE_SATURATION_MAX = 2

export function clampSceneSaturation(x: number): number {
  if (!Number.isFinite(x)) return DEFAULT_SCENE_SATURATION
  return Math.min(SCENE_SATURATION_MAX, Math.max(SCENE_SATURATION_MIN, x))
}

/**
 * White-balance tint for the analytical lights (sun / hemisphere / ambient) —
 * a component-wise multiplier. Neutral (1,1,1) at bias 0 so the default look
 * is byte-identical; +1 leans amber (R up, B down), -1 leans cool. Green is
 * pinned at 1 so overall luminance barely moves. Works on EVERY tier (the
 * analytical lights exist everywhere; the Medium+ IBL probe keeps its fixed
 * tint, so the strength is a touch gentler there — acceptable for a user dial).
 */
export function warmthTintRGB(bias: number): [number, number, number] {
  const b = clampSceneWarmth(bias)
  return [1 + 0.14 * b, 1, 1 - 0.16 * b]
}

/** Map the user scene-saturation multiplier onto the HueSaturation pass's
 *  `saturation` param (-1..1). The pass ships a +0.06 baseline ("finishes read
 *  rich, not muddy") — the default multiplier 1 must reproduce exactly that. */
export const BASE_POST_SATURATION = 0.06

export function hueSatSaturation(sceneSaturation: number): number {
  const s = clampSceneSaturation(sceneSaturation)
  return Math.min(1, Math.max(-1, BASE_POST_SATURATION + (s - 1)))
}

/** Exposure compensation per operator so switching the look keeps the scene at
 *  roughly the same perceived brightness (AgX maps middle-grey lower than ACES,
 *  so it gets a small boost; Neutral tracks ACES closely). Multiplies the
 *  altitude-driven `grade().exposure`. */
export function toneExposureBias(mode: ToneMappingMode): number {
  switch (mode) {
    case 'agx':
      return 1.15
    case 'neutral':
      return 1.0
    default:
      return 1.0
  }
}

/** Map sun altitude → exposure + white-balance warmth. */
export function grade(altitude: number): Grade {
  // Smoothstep ramps from civil dusk (~-0.12 rad) to mid-morning (~0.5 rad).
  const day = smoothstep(-0.12, 0.5, altitude)
  // Exposure spans 0.78 (night floor) → 1.20 (full day), clamped to [0.7, 1.25].
  const exposure = clamp(0.78 + day * 0.42, 0.7, 1.25)
  // The 0.08 rad offset places peak warmth ~5° above the true horizon (golden-hour knee).
  const horizonBand = 1 - smoothstep(0.0, 0.35, Math.abs(altitude - 0.08))
  const warmth = clamp(0.2 + horizonBand * 0.6, 0, 1)
  return { exposure, warmth }
}

/**
 * Image-based-lighting fill compensation (LIGHT-IBL-OVERLAP).
 *
 * The analytical hemisphere + ambient fill in `Lighting` is tuned to be the
 * SOLE soft fill on the flat Performance tier (no IBL). On Medium+ tiers the
 * procedural Lightformer environment (`SceneEnvironment`) adds its own ambient
 * bounce on TOP of that fill, scaled by the day level (`environmentIntensity =
 * 0.12 + dayLevel*0.55`). The two then OVERLAP and a midday scene over-brightens
 * — sunlit walls wash out and surface colours flatten ("the lighting and graphics
 * settings overlap").
 *
 * `iblFillScale` scales the analytical fill DOWN in proportion to the day level
 * (which is exactly what drives the IBL intensity), so the combined ambient stays
 * consistent with the flat tier: maximum reduction at midday (when IBL is
 * strongest), none at night (when IBL sits near its 0.12 floor and the analytical
 * fill must still lift interiors). Pure + unit-tested.
 */
export const IBL_FILL_COMPENSATION = 0.5

export function iblFillScale(iblActive: boolean, dayLevel: number): number {
  if (!iblActive) return 1
  const d = clamp(Number.isFinite(dayLevel) ? dayLevel : 0, 0, 1)
  return 1 - IBL_FILL_COMPENSATION * d
}

/**
 * Daytime bloom ramp (RD-409 tail / LIGHT-IBL-OVERLAP).
 *
 * Bloom exists to glow genuinely-emissive NIGHT fixtures. In daylight the same
 * pass smears a milky white veil/halo over broad sunlit surfaces — and because a
 * sunlit wall is BRIGHTER in HDR than a night lamp, a single luminance threshold
 * can't tell them apart (raising it past the fixture peaks would kill the night
 * glow). So instead ramp the bloom STRENGTH down with the day level: full at
 * night (fixtures glow, threshold unchanged so the `fixtureGlow` lock-step holds)
 * and →0 at midday (no daytime veil). `dayLevel` is the 0→1 sun level
 * (`lightingFromAltitude(alt).sun`). Pure + unit-tested.
 */
export function bloomIntensityForDay(dayLevel: number): number {
  const d = clamp(Number.isFinite(dayLevel) ? dayLevel : 0, 0, 1)
  return BLOOM.intensity * (1 - d)
}

/**
 * Whether the Bloom pass should be MOUNTED at all for a given day level
 * (BLOOM-MIP-FLASH). Once {@link bloomIntensityForDay} has ramped to 0 the pass
 * has nothing to contribute, and an intensity-zeroed Bloom is not inert: it
 * still runs its blur chain every frame AND its blur texture is still sampled by
 * the composer's combined effect shader, which is the path that intermittently
 * blanked whole frames on ANGLE/Metal. So daylight drops the pass entirely —
 * cheaper *and* one less way to flash. Pure so `EffectsImpl`'s gate is testable
 * without a renderer.
 */
export function bloomActiveForDay(dayLevel: number): boolean {
  return bloomIntensityForDay(dayLevel) > 0
}

/**
 * Where the curtain/blind attenuation is applied (KEY-FILL-BALANCE).
 *
 * `curtainLightEffect` models "drawn curtains dim the light entering through
 * windows". It used to do that by multiplying the SUN directional light's
 * intensity by the scene-average curtain transmission — which is the wrong light
 * to dim, and it flattened the whole render:
 *
 *  - The directional light IS the sun. Dimming it darkens the *outside* of the
 *    building and every sunlit exterior surface because someone drew a bedroom
 *    curtain, and `sceneAttenuationFactor` averages across ALL windows, so the
 *    more curtained windows a plan has the darker the entire world gets.
 *  - It is the only SHADOW-CASTING light in the scene. Everything else
 *    (hemisphere, ambient, the IBL probe) is non-directional fill that casts
 *    nothing. Measured on the default furnished 4-room flat at 09:00, Maximum:
 *    sun 0.41 vs hemisphere 0.33 + ambient 0.11 + environment 0.66 ≈ 1.10 of
 *    fill — a key:fill ratio of 0.37:1. Below about 1:1 a cast shadow can only
 *    remove a small fraction of a surface's light, so it reads as a faint tint
 *    or not at all: turning the 4096² shadow map off at Maximum changed 0.47% of
 *    pixels at 13:00 and 17:00, and the 09:00 difference was pure edge aliasing.
 *    That is the structural reason interiors looked flat and furniture looked
 *    like it was floating — "animation, not real" — no matter which tier was on.
 *
 * The light curtains actually block is the DIFFUSE skylight coming through the
 * window, which in this renderer is exactly the fill: hemisphere + ambient + the
 * IBL probe. Attenuating the fill keeps the feature's user-visible behaviour
 * (drawing the curtains darkens the room) while leaving the sun at full strength
 * so it can do its job as a key light.
 *
 * Pure passthrough + clamp so the site of the multiply is named, greppable and
 * unit-testable rather than an unexplained factor at three call sites.
 */
export function windowFillAttenuation(attenuation: number): number {
  if (!Number.isFinite(attenuation)) return 1
  return clamp(attenuation, 0, 1)
}

/** Soft-shadow tuning for the sun directional light (PCFSoftShadowMap). */
export const SOFT_SHADOW = {
  radius: 4,
  normalBias: 0.04,
  // Small negative depth bias counteracts self-shadowing/acne on PCFSoftShadowMap.
  bias: -0.0002,
} as const

/**
 * Sun-shadow filtering algorithm (PHOTO-SOFTSHADOW). Pure string union — the
 * renderer maps it to a three `ShadowMapType` constant in
 * `ShadowFilterController` (same pattern as `ToneMappingMode` /
 * `TONE_MAPPING_THREE`).
 *
 *  - `pcf` — PCFShadowMap, the cheap default. Hard-ish edges (`shadow.radius`
 *    is ignored), no bleed. (The historical `PCFSoftShadowMap` is DEPRECATED on
 *    three r184 — the renderer coerces it to plain PCF with a console warning —
 *    so `pcf` is what the app has effectively rendered since the r184 bump.)
 *  - `vsm` — VSMShadowMap: variance shadow mapping with a real separable blur
 *    (`shadow.radius` + `shadow.blurSamples`), giving genuinely soft penumbrae.
 *    Trade-offs (three docs + forum guidance): (a) prone to LIGHT BLEEDING —
 *    bright halos where casters overlap / at thin occluders; (b) under VSM
 *    **all shadow receivers also render into the shadow map** (they contribute
 *    to the variance computation), so receive-only surfaces self-cast — bias/
 *    normalBias discipline matters more than under PCF.
 *
 * NOT drei `<SoftShadows>`/PCSS — broken on three r182+ (drei #2583).
 */
export type ShadowFilter = 'pcf' | 'vsm'

/**
 * Which shadow filter a render tier earns. Medium+ get VSM soft sun shadows;
 * Performance keeps PCF — it renders shadowless (`shadowMapSize` 0), and
 * staying on the cheap filter also avoids VSM's receivers-also-cast material
 * recompiles on the flat default tier. Pure + unit-tested.
 */
export function shadowFilterForTier(tier: RenderTier): ShadowFilter {
  return tier === 'performance' ? 'pcf' : 'vsm'
}

/** VSM sun-shadow tuning (PHOTO-SOFTSHADOW). `radius`/`blurSamples` drive the
 *  separable blur over the variance map; bias values are tuned against VSM's
 *  receivers-also-cast self-shadowing (see `ShadowFilter`). */
export const VSM_SHADOW = {
  /** Blur kernel radius in shadow-map texels. */
  radius: 6,
  /** Samples per blur pass (quality of the separable blur). */
  blurSamples: 12,
  normalBias: 0.02,
  // VSM tolerates a small negative bias; variance filtering handles most acne.
  bias: -0.0002,
} as const

/** Resolved per-light shadow params for a filter (what `Lighting` feeds the
 *  sun `DirectionalLight`). Pure so the pairing is unit-testable. */
export function shadowParamsForFilter(filter: ShadowFilter): {
  radius: number
  blurSamples: number
  normalBias: number
  bias: number
} {
  return filter === 'vsm' ? VSM_SHADOW : { ...SOFT_SHADOW, blurSamples: 8 } // blurSamples = three default; inert under PCF
}

/** Screen-space AO tuning (N8AO) — deeper than the old defaults so corners
 *  and recesses ground like the reference renders. */
export const AO = {
  aoRadius: 0.7,
  distanceFalloff: 1.2,
  intensity: 3.0,
} as const

/**
 * Bloom tuning for the High/Maximum post stack (`EffectsImpl`).
 *
 * The threshold is the load-bearing value: it must sit **above** the brightest
 * broad *daytime* surfaces (sunlit white walls/ceilings under the IBL probe,
 * graded at exposure ~1.2) so the bloom doesn't smear a milky veil across the
 * whole frame, yet **below** the genuinely emissive night fixtures so a lit lamp
 * still glows. The fixture emissive peaks (`fixtureGlow.ts`) are tuned to clear
 * this with margin (shade ~1.6, strip ~1.76, bulb ~1.85 ≫ 1.35). Keep the two in
 * lock-step: raising this needs the fixture peaks raised too (and vice-versa),
 * which the `fixtureGlow` test asserts against `BLOOM_LUMINANCE_THRESHOLD`.
 */
export const BLOOM = {
  /** Luminance above which a pixel contributes to bloom. Raised from the old
   *  1.05 (which bloomed broad sunlit walls → the "milky maximum" bug) to 1.35,
   *  clearing daytime diffuse while keeping emissive fixtures over the line. */
  luminanceThreshold: 1.35,
  /** Soft knee width around the threshold — wider than before so the cutover is
   *  gradual (no hard ring on a fixture edge). */
  luminanceSmoothing: 0.25,
  /** Overall glow strength. Trimmed from 0.6 so even an over-threshold emitter
   *  blooms gently, not blown out. */
  intensity: 0.45,
} as const
