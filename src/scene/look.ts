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

/**
 * The default view transform (TONE-CURVE-CHOICE, `materials/CLAUDE.md`).
 *
 * **AgX, not ACES Filmic.** three's `ACESFilmicToneMapping` applies its curve PER
 * CHANNEL, so on a warm mid-dark surface it crushes blue far harder than red and
 * invents saturation the albedo never had: a #7a5c3c wood whose own sRGB HSV
 * saturation is 0.508 rendered at **0.833**, of which ~0.21 was the curve. It
 * also clipped highlights hard. Measured whole-frame at Medium across walk +
 * orbit at 09:00/13:00/18:00/21:00, filmic → AgX:
 *
 *   - blown-to-white pixels **1.94% → 0.28%** (a 4–7x cut at EVERY hour, both
 *     view modes) — visibly recovering ceiling gradation and curtain weave;
 *   - mean chroma 0.180 → 0.152, pixels past 0.35 saturation 11.1% → 4.0%;
 *   - mean brightness 185.9 → 176.7.
 *
 * Read AgX's lower pixel sigma (54.5 → 43.3) with care: clipping INFLATES
 * variance, so much of filmic's apparent "contrast" was the blown pixels.
 * Khronos Neutral was measured too and is clearly wrong as a default despite
 * perfect highlights — it pushes chroma to 0.307 in daylight and 0.518 at 21:00
 * in orbit (89% of pixels past 0.35 saturation), i.e. hard toward the cartoon
 * look this replaced.
 *
 * Both tier paths already honour it: Performance mounts no composer and reads
 * `TONE_MAPPING_THREE` (`AgXToneMapping`), Medium and up go through the
 * `<ToneMapping>` effect via `TONE_MAPPING_POST` (see TONE-POST). An explicit
 * user pick still wins, and `'auto'` still picks Neutral while previewing
 * finishes (accurate product colour).
 *
 * The known cost, accepted deliberately with the user's sign-off: the five
 * board-matched SNV finishes shift by 0.05–0.13 of peak-normalised response — a
 * subtle paling and de-warming, largest on the bathroom floor, which loses some
 * of the sage undertone SNV-BOARDS calls for. They could not be re-verified
 * because the board photos are not in the repo, and the calibration's "response"
 * is not single-valued across view modes (both documented in TONE-CALIBRATION).
 */
export const DEFAULT_TONE_MAPPING: ToneMappingMode = 'agx'

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

/**
 * Map the user scene-saturation multiplier onto the HueSaturation pass's
 * `saturation` param (-1..1). The default multiplier 1 must reproduce exactly
 * this baseline.
 *
 * **The baseline is 0, not the historical +0.06 (POST-SAT-NEUTRAL).** The old
 * value was there so "finishes read rich, not muddy", which assumed the view
 * transform delivered the albedo faithfully. It does not: three's
 * `ACESFilmicToneMapping` applies its curve PER CHANNEL, so on a warm mid-dark
 * surface it crushes blue far harder than red and saturation climbs. Measured
 * over the default flat's wood at walk/Medium/09:00 (wood pixels only via a
 * raycast mask, in-run noise floor 0.00), a #7a5c3c albedo whose own sRGB HSV
 * saturation is 0.508 rendered at **0.833** — and the decomposition put ~0.21 of
 * that on the tone curve, 0.069 on THIS constant, and only ~0.05 on the surface
 * being dark. Adding a deliberate saturation boost on top of a transform that
 * already over-saturates is doubling down, so the boost is gone.
 *
 * Removing it is small and uniformly positive — measured whole-frame across
 * walk + orbit at 09:00 / 13:00 / 21:00, mean chroma fell 0.010–0.018 (e.g.
 * walk 09:00 0.180 → 0.170, orbit 21:00 0.328 → 0.310) and the fraction of
 * pixels above 0.35 saturation fell 2.4–3.5 points, with mean brightness
 * (±0.2), contrast (±0.11) and the clipped fraction all unmoved. It is NOT the
 * main fix; the tone curve is (see TONE-CURVE-CHOICE in `materials/CLAUDE.md`),
 * and that one is blocked on re-solving the five calibrated SNV swatches.
 *
 * The user dial is unaffected in spirit: 1 is now neutral and the slider still
 * moves saturation either way across its full 0..2 range.
 */
export const BASE_POST_SATURATION = 0

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
 * PHOTO-FILL — how far the *positionless* fill is pulled down when the
 * `photographicFill` feature is on.
 *
 * Seven material levers were tried across v0.31.5.157–.161 to close the measured
 * textile gap against reference photographs (weave `normalScale`, the wrinkle
 * channel, part jitter, a tessellated sag/crease cushion, weave tiling density,
 * fabric pattern, drapery relief). **None moved micro-contrast more than ~20 %
 * and several moved it down.** Simply turning the lamps off moved it **+62 %** on
 * the same materials — because surface relief only becomes image contrast when
 * something DIRECTIONAL shades its two sides differently, and the app's fill has
 * no direction. The same wall was hit from the lighting side in `.133`/`.138`/
 * `.141`.
 *
 * This scales the hemisphere + ambient ONLY. The sun keeps its full graded
 * intensity (KEY-FILL-BALANCE), so the effect is purely a key:fill ratio change —
 * shadows deepen and relief reads, rather than the whole scene going dark.
 *
 * **Default OFF.** Reducing the fill is the DEFAULT-GLOOM trade measured in
 * `.86` and explicitly left as the user's decision; this makes the alternative
 * reachable and comparable without changing what anybody sees by default.
 */
/**
 * Calibrated, not guessed. With `photographicFill` on, the daytime fixtures are
 * also skipped (PHOTO-FILL-FIXTURES), and the pair was swept against the
 * photographic deep-shadow band measured in `.134` (`%<64` = 11.2–12.2 %):
 *
 *   fixtures off only (1.0)  ->  7.78 %      sofa micro/mean 0.0761
 *   **0.8**                  -> **11.39 %**  sofa micro/mean 0.0838
 *   0.55                     -> 21.50 %      sofa micro/mean 0.0986  (overshoots ~2x)
 *
 * 0.8 lands inside the band; 0.55 crushes past it.
 */
export const PHOTO_FILL_SCALE = 0.8

/**
 * Fabric weave relief, paired with the lighting balance (PHOTO-FILL-RELIEF).
 *
 * The shipped relief values were tuned under the shipped fill, and under that
 * fill they are near their useful ceiling — measured, raising drapery relief from
 * 0.65 to 2.2 buys only **+10 %** of surface micro-contrast, because a bump only
 * reads when something directional shades its two sides differently.
 *
 * Under `photographicFill` the SAME change buys **+138 %** (0.0346 → 0.0822).
 * Relief and light balance are one knob measured as two: turn the fill down and
 * the relief that was previously wasted starts paying. So the flag carries both.
 *
 * Values are the measured points, not a multiplier — a single scale cannot serve
 * a 0.65 drapery baseline and a 1.3 upholstery one at once.
 */
export const PHOTO_WEAVE = { drapery: 2.2, draperyLinen: 2.6, upholstery: 2.0 } as const

/** `photo` when the photographic balance is on, else `base`. Pure. */
export function photographicWeave(base: number, photo: number, on: boolean): number {
  return on ? photo : base
}

/** Fill multiplier for the current `photographicFill` setting. Pure. */
export function photographicFillScale(on: boolean): number {
  return on ? PHOTO_FILL_SCALE : 1
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
 *    or not at all. That is the structural reason interiors looked flat and
 *    furniture looked like it was floating — "animation, not real" — no matter
 *    which tier was on. (An earlier revision quoted "0.47% of pixels" here from a
 *    probe that had shadows off in BOTH arms — see QUALITY-OVERRIDE-UNDEF in
 *    `quality.ts`. Re-measured soundly, the sun shadow map still has the worst
 *    value-per-millisecond in the stack; the numbers live in `src/scene/CLAUDE.md`.)
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
