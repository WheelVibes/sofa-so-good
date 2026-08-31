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
/**
 * Warmth the photographic look adds to the IBL PROBE (PHOTO-WARMTH).
 *
 * Measured with the window masked out — so both sides describe the *lit surfaces
 * of a room* — the reference photographs' highlights sit at **R/B 1.10–1.13** and
 * their midtones at 1.12–1.42, while the app's photographic look reads **1.006
 * and 1.005**: neutral. Real interiors bounce daylight off warm floors, timber
 * and cream paint; the app's fill is graded from the sky, which is blue.
 *
 * `.177` tried this on `sceneWarmth`, which tints the ANALYTICAL lights, and got
 * a fifth of the predicted effect: under the photographic look those are scaled
 * to 0.62–0.8 and the **IBL probe** — untinted — carries the rest. So the tint
 * has to go on the probe, which is what `tintHex` below is for.
 */
export const PHOTO_PROBE_WARMTH = 0.35

/**
 * Apply a warmth bias to a `#rrggbb` colour, for the IBL probe's Lightformers.
 * Returns the input unchanged at bias 0 (so the shipped probe is byte-identical
 * and never re-bakes), and clamps each channel. Pure.
 */
export function tintHex(hex: string, bias: number): string {
  const b = clampSceneWarmth(bias)
  if (b === 0) return hex
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = Number.parseInt(m[1], 16)
  const t = warmthTintRGB(b)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) =>
    Math.round(Math.max(0, Math.min(255, v * t[i]))),
  )
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

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
 * `photographicFill` feature is on, **per render tier**.
 *
 * Seven material levers were tried across v0.31.5.157–.161 to close the measured
 * textile gap against reference photographs. **None moved micro-contrast more
 * than ~20 % and several moved it down**; simply turning the daytime fixtures off
 * moved it **+62 %**, because surface relief only becomes image contrast when
 * something DIRECTIONAL shades its two sides differently.
 *
 * This scales the hemisphere, the flat ambient and the IBL probe. The sun keeps
 * its full graded intensity (KEY-FILL-BALANCE), so the effect is a key:fill ratio
 * change, not a dimmer.
 *
 * **Per tier, because the lower tiers make less shadow of their own** and so need
 * a bigger cut to reach the same place. Calibrated by sweep against `.134`'s
 * photographic deep-shadow band (`%<64` = 11.2–12.2 %) at one walk pose, 13:00:
 *
 * **Re-calibrated twice; the second time was the honest one (v0.31.5.185).**
 * `.182` claimed a Puppeteer ELEMENT screenshot excludes overlaying DOM. It does
 * not — it clips the composited page to the element's box, so the toolbar, the
 * Measure button and the minimap were still in every "canvas-only" frame (verified
 * by sampling those pixels: 235,232,227 in a page shot and an element shot alike).
 * Hiding the DOM instead blanks the canvas, because the canvas is not a direct
 * child of the app root. Excluding the HUD RECTANGLES is what actually works, and
 * that is what the probe does again.
 *
 * On properly HUD-excluded frames the `.182` values read 12.61 / 12.52 / 12.89 %,
 * a little dark; nudged to **0.92 / 0.735 / 0.40** they read **12.28 / 11.88 /
 * 12.31 %**.
 *
 * **What that band actually is (v0.31.5.186).** It was derived from TWO
 * photographs. Measured across four, `%<64` runs **1.90 / 4.65 / 11.23 /
 * 12.17 %** — a six-fold spread driven by how dark a room's furnishings are, not
 * by anything about photography. The 11.2–12.2 % "band" is simply the darkest two
 * of the four. So this setting does not make the app "photographic"; it makes it
 * match a **dark-furnished** interior. The shipped default, at ~1.2 %, sits beside
 * the lightest photograph (1.90 %) and is equally defensible for the white,
 * pale-furnished flat the app ships. The two looks BRACKET the photographic range
 * rather than one being right.
 *
 * Superseded history: The first calibration
 * measured page screenshots, which include the bright toolbar and minimap; that
 * HUD lifted the frame mean and compressed `%<64`, so every tier was tuned too
 * dark. On clean frames, at the old values: maximum 12.91 %, medium 13.39 %,
 * performance 8.41 % — two past the band and one short of it.
 *
 * | tier | sweep on clean frames | chosen |
 * | --- | --- | --- |
 * | maximum | 0.80 → 12.91 %, 0.85 → 12.23 % | **0.89** |
 * | medium | 0.62 → 13.39 %, 0.675 → 11.98 %, 0.70 → 11.52 % | **0.70** |
 * | performance | 0.60 → 8.41 %, 0.45 → 9.73 %, 0.32 → 12.89 % | **0.37** |
 *
 * **Performance CAN reach the band** — `.168` concluded it could not, from
 * HUD-contaminated readings that made it look nearly flat (3.25 → 4.71 % across
 * the whole sweep). On clean frames it moves 8.41 → 12.89 %, which is plenty.
 *
 * **Default OFF.** Reducing the fill is the DEFAULT-GLOOM trade measured in `.86`
 * and left as the user's decision.
 */
export const PHOTO_FILL_SCALE = {
  maximum: 0.92,
  high: 0.92,
  medium: 0.735,
  performance: 0.4,
} as const

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
 *
 * **Raised in v0.31.5.184.** `.172` capped these at 2.2 / 2.0 because more relief
 * turned the fabric into a regular horizontal-dash lattice — "a grid that looks
 * like mesh screen". `.173` removed the lattice (`threadGain` varies every thread's
 * thickness and brightness), so the cap moved. Re-swept and judged on the 4× crop
 * the way `.172` said it had to be: at 3.2 / 2.8 the weave is clearly woven and
 * still irregular, while 4.5 / 3.6 reads as coarse basket-weave on a sofa that is
 * meant to be cotton. Surface micro-contrast, medium tier: curtain **0.0866 →
 * 0.1055**, sofa **0.0937 → 0.1068**, against photographs at 0.140–0.187 / 0.174.
 *
 * **The 0.140–0.187 / 0.174 target is retracted (v0.31.5.187) — do not raise these
 * values to chase it.** Those figures were single crops of two photographs. Measured
 * as distributions (60 px tiles) across four, surface micro-contrast has no single
 * photographic value: upholstery spans **0.025–0.214** and drapery **0.001–0.275**,
 * because the statistic is set by lighting geometry and exposure as much as by weave
 * — a backlit sheer medians 0.008, a side-lit drape 0.163, in the same photograph set.
 * The spread WITHIN one photograph's own sofa (0.048–0.116) is wider than the whole
 * gap ten rounds were spent closing. Both app looks already sit inside the range
 * (sofa 0.047–0.107, curtain 0.036–0.137), so this axis is closed on the numbers.
 * Any further move here must be justified by the 4× crop judgement of `.172`/`.184`,
 * never by a micro/mean target.
 */
export const PHOTO_WEAVE = { drapery: 3.2, draperyLinen: 3.6, upholstery: 2.8 } as const

/** `photo` when the photographic balance is on, else `base`. Pure. */
export function photographicWeave(base: number, photo: number, on: boolean): number {
  return on ? photo : base
}

/**
 * Whether the FIXTURES actually render, given the user's switch and the view
 * (PHOTO-FILL-VIEW).
 *
 * This separates two things that were the same value: **the user's lights
 * setting**, which their toggle owns and which nothing here writes, and **what a
 * given view renders**, which is a look decision.
 *
 * Measured across v0.31.5.163–.165, the photographic balance is **view-dependent**:
 *
 *  - **First person.** Every lamp burning at 1 pm is what makes the walk view read
 *    as CG. Skipping them takes deep shadow from `%<64` 1.28 % into the
 *    photographic 11.2–12.2 % band and roughly doubles textile micro-contrast.
 *  - **Orbit / dollhouse.** The opposite. The lit fixtures are what the boot view
 *    was designed around — without them the model loses its warmth entirely
 *    (R/B 1.047 → 0.998, saturation −43 %) for no photographic gain, because a
 *    dollhouse is a product illustration, not a photograph of a room you are
 *    standing in. `firstPaintDaylight.ts` recorded that argument first.
 *
 * So the fixtures are skipped **only** in first person, **only** while the sun is
 * genuinely strong, and **only** under `photographicFill`. Everything else — the
 * flag off, any other camera, the ends of the day, and the user having
 * deliberately switched the lights on — renders exactly as shipped. Pure, so the
 * whole rule is unit-testable.
 *
 * `sunStrength` is `lightingFromAltitude(alt).sun`, NOT `daylightFromAltitude`.
 * The latter is a night ramp that saturates at 1 for every altitude above 0°, so
 * it called 19:00 — sun 1.6° up, an hour from dark — "full daylight" and held the
 * lamps off: measured `%<64` **29.57 %** at that hour against a photographic
 * 11.2–12.2 %, with mean luma 88.1. Sun strength tracks how much light there
 * actually is (1.0 above 30°, 0.85 at 10°, 0.4 at the horizon).
 */
/** Sun strength at which the fixtures start dimming, and where they reach zero.
 *  A ramp rather than a step: a hard cut-off pops the whole room's brightness as
 *  the time slider crosses it (measured either side: mean 175 → 109). */
export const PHOTO_FIXTURE_SUN_FADE = { start: 0.86, full: 0.95 } as const

/** 0 … 1 — how strongly the fixtures render in this view. */
export function fixturesLevel(
  lightsOn: boolean,
  cameraMode: string,
  sunStrength: number,
  photographicFill: boolean,
): number {
  if (!lightsOn) return 0
  if (!photographicFill) return 1
  if (cameraMode !== 'firstPerson') return 1
  if (!Number.isFinite(sunStrength)) return 1
  const { start, full } = PHOTO_FIXTURE_SUN_FADE
  if (sunStrength <= start) return 1
  if (sunStrength >= full) return 0
  const t = (sunStrength - start) / (full - start)
  return 1 - t * t * (3 - 2 * t) // smoothstep
}

/** Fill multiplier for the current `photographicFill` setting and tier. Pure.
 *  An unknown tier falls back to `medium`, which is the capability-detected
 *  boot default. */
export function photographicFillScale(on: boolean, tier: string): number {
  if (!on) return 1
  return (PHOTO_FILL_SCALE as Record<string, number>)[tier] ?? PHOTO_FILL_SCALE.medium
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

/**
 * Screen-space AO tuning (N8AO) — deeper than the old defaults so corners and
 * recesses ground like the reference renders.
 *
 * **Raised in v0.31.5.196, and AO turns out to be the ONLY thing making a
 * contact shadow indoors.** `.194` measured the floor under the app's furniture
 * at **0.786** (photographic look) and **0.865** (default) against reference
 * photographs at **0.579–0.725** — too bright in both. Pricing AO against that
 * metric explains why: with `ao: false` the ratio is **0.983**, i.e. floor under
 * a sofa is indistinguishable from open floor. Interiors here are fill-lit and
 * almost nothing casts a shadow into them (INTERIOR-SHADOW), so screen-space AO
 * is carrying the entire contact cue on its own.
 *
 * Swept against that target and re-checked against every band in
 * `light-distribution.mjs`:
 *
 *   radius / falloff / intensity   under/open   `%<64` (photo look)
 *   0.7 / 1.2 / 3.0  (was)         0.786        7.18 %
 *   0.7 / 1.2 / 6.0                0.721        —
 *   1.0 / 1.2 / 4.5  (shipped)     **0.722**    **10.43 %**
 *   1.0 / 2.0 / 4.5                0.641        15.16 %  ← too dark
 *   photographs                    0.579–0.725  1.9–12.2 %
 *
 * Radius rather than intensity alone: a metre-scale radius reaches the same
 * ratio as intensity 6.0 at a third less intensity, and contact occlusion in a
 * room genuinely is a metre-scale effect. `distanceFalloff` 2.0 reaches mid-band
 * (0.641) but pushes the photographic look's deep-shadow fraction to 15.16 %,
 * past the darkest of the four reference photographs — so the shipped point is
 * the one where BOTH bands hold, not the one that centres this ratio.
 *
 * It also repaid the shadow depth `PHOTO_GROUND_BOUNCE` cost: the photographic
 * look's `%<64` went 11.88 → 7.18 % with the bounce and back to **10.43 %** with
 * this, and the DEFAULT look entered the photographic range for the first time
 * (1.32 → **2.03 %**; the four photographs start at 1.9 %).
 *
 * **Free.** N8AO's cost is sample-count driven, and neither radius nor intensity
 * changes it — `frame-time.mjs` reads medium p90 **8.3 ms** against the 8.4 ms
 * already documented in `src/scene/CLAUDE.md`.
 *
 * Known remaining gap: the DEFAULT look's under-furniture floor is still
 * **0.820**, above the photographic 0.725. Measure with
 * `scripts/dev-probes/underside-shadow.mjs`.
 */
export const AO = {
  aoRadius: 1.0,
  distanceFalloff: 1.2,
  intensity: 4.5,
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

/**
 * PHOTO-GROUND-BOUNCE — the whole-floor bounce the photographic look was missing.
 *
 * `.188` isolated the last region ratio outside the reference photographs and
 * named its mechanism: four photographs put the ceiling at **1.08–1.28** of frame
 * mean, and the photographic look sat at **0.87**. The default look is already
 * fine at 1.12 — its flat ambient fill stands in for bounce — so this is a cost
 * of the one look that removes that fill to buy its shadow depth. Nothing was
 * relighting the ceiling from the floor.
 *
 * Three shapes were tried before this one. A rect-area emitter in the window's
 * floor pool is compiled out by the Lambert ceiling (`RE_Direct_RectArea` exists
 * only in the physical lighting model, `.189`). A spot in the same place
 * contributes nothing at all, still undiagnosed. A point light lights the WALLS
 * preferentially, because a room's walls are nearer the floor than its ceiling is
 * and 1/d² does the rest — +0.15 on the walls for +0.04 on the ceiling (`.190`).
 *
 * The term that works is the one `.183` refused: the hemisphere's `groundColor`,
 * which is a whole-floor model rather than a window-local one. That matters
 * because a real ceiling is lit by bounce from the entire floor, and it is why a
 * positioned emitter could never move this ratio. Its angular distribution is
 * also close to right — three shades a hemisphere as
 * `mix(groundColor, skyColor, 0.5·dot(n, up) + 0.5)`, so `groundColor` reaches a
 * down-facing ceiling in full, a vertical wall by half, and an up-facing floor
 * not at all, which is the shape of a real floor bounce.
 *
 * **RE-TUNED 6.5 -> 3 in `.208`.** Everything below was measured against ceiling
 * ÷ FRAME mean, and `.206` showed that ratio moves with what is in shot — the
 * photographs are wide interior shots, the probe is a window-facing walk view, so
 * the two were never comparable. Against ceiling ÷ WALL (both surfaces in the
 * same frame, so composition cancels) the photographs read **0.90 and 1.00**, and
 * the app reads 0.78 at x1, **0.95 at x3**, 1.09 at x6.5. Three puts all four
 * habitable rooms in band (living/dining 0.95, main bedroom 0.98, bedroom 2 0.89,
 * bedroom 3 0.96) where 6.5 missed high in every one. The frame-relative numbers
 * that follow are kept as the record of how the term was originally justified.
 *
 * **6.5 was where the ceiling reached the (frame-relative) band**, measured with
 * `light-distribution.mjs` at 13:00/medium:
 *
 *   ground bounce   %<64      ceiling   wall
 *   x1 (was)        11.88 %   0.87      1.11
 *   x3.5             9.22 %   1.01      1.12
 *   x6.5             7.20 %   1.08      1.13
 *   photographs     1.9–12.2  1.08–1.28 0.53–1.43
 *
 * The wall RATIO barely moves, but read that with care: the frame mean rises 17 %
 * over the sweep, so the walls rise with it in absolute terms — an amplified diff
 * of the two frames shows the change plainly on the walls, not only the ceiling
 * (`.195`). That is what a bounce does; it is not a targeted ceiling repair.
 *
 * `%<64` falls 11.88 → 7.20 %, a real loss of shadow depth, and it stays inside
 * the four-photograph range `.186` established. It is applied ONLY under the
 * photographic look — the default look already measures inside the ceiling band
 * and would be pushed out of it.
 *
 * **`.183`'s objection is not refutable by measurement, and that is why this
 * ships on a visual check.** It refused a ×4.5 ground term because furniture
 * undersides looked too light. That surface class cannot be calibrated: a
 * photograph shows the SHADOW under a piece, never the underside plane (`.195`),
 * and from the walk camera the app shows no down-facing faces between shin and
 * table height at all — a standing eye cannot see under a coffee table. The
 * floor-shadow proxy built for it in `.191`/`.192` is structurally blind here,
 * since `groundColor` contributes nothing to an up-facing floor: it reads 0.786
 * identically at ×1, ×3.5 and ×6.5.
 */
export const PHOTO_GROUND_BOUNCE = 3

export function photographicGroundBounce(on: boolean): number {
  return on ? PHOTO_GROUND_BOUNCE : 1
}

/**
 * CURTAIN-TRANSLUCENCY — how much daylight drapery scatters forward.
 *
 * `.198` measured a drawn curtain at **0.69** of frame mean against photographs
 * at **1.32–1.48**; `.199` refuted both cheap stand-ins (an emissive reaches the
 * ratio but destroys the weave, absolute micro-sd 4.10 → 2.62; `transmission`
 * buys 0.10 of ratio and costs a third of the weave anyway). The shipped model is
 * a normal-responsive wrap term — see `materials/drapeTranslucency.ts` for why
 * that is the only shape that can be bright and still show folds.
 *
 * **Re-tuned 6 -> 4 in `.208`**, because the two terms are COUPLED: lowering
 * `PHOTO_GROUND_BOUNCE` darkens the room, and this ratio is measured against the
 * room, so the curtain rose to 1.53 without being touched. At bounce 3 the sweep
 * reads t=4 -> **1.38**, t=5 -> 1.47. Retune both together or neither.
 *
 * The value is swept against BOTH numbers: the ratio must reach 1.32–1.48 and the
 * absolute micro-sd must stay near its 4.10 baseline. Measure with
 * `scripts/dev-probes/curtain-glow.mjs`.
 *
 * **Re-tuned 14 → 6 in `.201`, on a corrected mask.** `.200` measured the window
 * plane by DEPTH alone, which also caught the wall BESIDE the window — same
 * plane, not curtain — and that dragged the mean down by roughly 0.3 of ratio.
 * Bounding the mask to the opening's own width moved the shipped `t=14` reading
 * from 1.41 to **1.73**, well past the band, and simultaneously erased an
 * apparent parity gap: the bedrooms had read ~0.25 low purely because their
 * curtains are narrower than their walls, so more wall fell inside the mask.
 * At 6 the photographic look measures **1.40 / 1.32 / 1.20** across the
 * living-dining, main-bedroom and bedroom-2 windows, and micro-sd stays at
 * **12.62** against the 4.10 baseline.
 */
export const CURTAIN_TRANSLUCENCY = 4

/**
 * PHOTO-GRAIN — the sensor grain a photograph always carries and a render does not.
 *
 * `.210` measured the high-frequency floor (micro-sd against a 4 px blur) on the
 * one surface with no texture map at all — the flat `#fafafa` ceiling:
 *
 *   photo C ceiling   0.70
 *   photo D ceiling   1.56
 *   app, shipped      0.46
 *
 * The app is about half as busy as the quietest photographic ceiling. Note the
 * deficit is NARROW: the app's painted walls measure 0.80–1.94 against the
 * photographs' 1.18–1.36, because the procedural plaster micro-normal already
 * supplies grain-scale detail there. Only surfaces carrying no map are short.
 *
 * Tied to the photographic look rather than applied always, because grain is a
 * property of a CAMERA, not of a room — the default look is the clean one by
 * design, and this arc has kept every photographic-realism trade behind that
 * switch since `.162`.
 *
 * **Measured at NATIVE render resolution, which matters.** A probe screenshot
 * taken at CSS pixels while the app renders at DPR 1.5+ averages per-pixel grain
 * away: the same frames read 0.46 downsampled and **0.10** native. Resolution
 * matching was checked rather than assumed — downsampling the app crop to the
 * photographs' pixels-per-metre moves it only 0.10 → 0.13, so the comparison
 * below is sound.
 *
 *   app, no grain     0.10      app, 0.04   0.48
 *   app, 0.07         0.62      photographs 0.76 / 1.49
 *
 * 0.07 lands just under the quietest photographic ceiling — deliberately the
 * conservative end. On a 2x crop it reads as an even sensor grain rather than as
 * an effect, and `frame-time.mjs` shows medium p90 8.2 ms against the documented
 * 8.3, i.e. free.
 */
export const PHOTO_GRAIN_OPACITY = 0.07
