/**
 * Pure, render-agnostic **analytic Preetham sky** model + an equirect painter.
 *
 * No three / no canvas deps (mirrors `backdropHorizon.ts`) so the radiance maths is
 * unit-testable headlessly. Given a sun direction + turbidity it returns linear-RGB
 * sky radiance for any view direction; `paintSkyEquirect` fills a 2:1 RGBA buffer
 * (upper hemisphere = sky, lower hemisphere = a ground tint) which the backdrop
 * adapter (`backdropEquirect.ts` `bakeSkyEquirect`) uploads as a `CanvasTexture`.
 *
 * The Preetham analytic model (Preetham, Shirley & Smits 1999) is the same family
 * the existing drei `<Sky>` dome uses, so the procedural backdrop reads consistently
 * with it. Output is *relative* linear radiance normalised to a plausible 0..~1 range
 * for an LDR backdrop — NOT physically-absolute luminance (the HDR/IBL path is a
 * separate, deferred concern and is intentionally untouched here).
 */

import type { WeatherGrade } from './weather'

export type Vec3 = readonly [number, number, number]

export interface SkyParams {
  /** Unit sun direction in scene space (+X east, +Y up, +Z south). */
  sunDir: Vec3
  /** Atmospheric turbidity (haze). ~2 = very clear, ~10 = very hazy. */
  turbidity: number
  /** Ground albedo tint for the lower hemisphere (linear RGB 0..1). */
  groundAlbedo?: Vec3
  /**
   * WEATHER-SKY. The cloud deck to lay over the analytic clear sky, or `undefined`
   * for a cloudless one. Built ONCE per bake by {@link skyWeather} from the shipped
   * {@link WeatherGrade} — see that function for the model and for why `undefined`
   * (not a neutral object) is what `clear` produces.
   */
  weather?: SkyWeather
}

/**
 * WEATHER-SKY — the cloud deck, expressed in the terms `lighting/weather.ts` already ships.
 *
 * Nothing here is a second weather model: every field is read straight off a {@link WeatherGrade}
 * (which is `READ-ONLY` to this module — see `skyWeather`), plus ONE quantity that depends on the
 * sky rather than on the weather ({@link domeLum}).
 */
export interface SkyWeather {
  /**
   * Deck cover fraction, 0..1 — **`1 - grade.sun`**.
   *
   * `weather.ts:BEAM` is documented as the cover fraction itself ("at 4 oktas the disc is obscured
   * half the time"), and `grade.sun` is that beam multiplier already ramped to identity by the day
   * level. So the fraction of the dome that is deck and the fraction of the beam that survives are
   * one number seen from two sides, and the sky gets it for free: `clear` 0, `partlyCloudy` 0.5,
   * `overcast`/`rain` 1, and **0 at night for every condition**.
   */
  cover: number
  /**
   * Deck irradiance relative to the clear dome's — **`grade.fill`**.
   *
   * `fill` is the multiplier the shipped grade puts on every positionless term, the hemisphere
   * light included; the hemisphere light IS the dome. Reusing it is what makes the painted sky
   * agree with the light by construction rather than by a matched pair of tables. It is applied
   * through an energy-normalised distribution ({@link overcastShape}), so `fill` is the ONLY level
   * term — the shape redistributes, it does not dim.
   *
   * Caveat, measured and reported rather than patched over: `fill` is fitted through a VERTICAL
   * APERTURE, so it is smaller than the dome-to-dome ratio a sky backdrop wants. The physical
   * figure is `GLOBAL_TRANSMITTANCE / k_d` with `k_d` the clear-sky diffuse fraction (0.22 in
   * `weather.ts`'s own prose, not exported) — 0.82 for `overcast` against `fill`'s 0.55. The
   * shipped sky is therefore on the moody side of a real deck.
   */
  level: number
  /**
   * The deck's ABSOLUTE chroma, luminance-normalised — **`grade.fillTint`**, not `skyTint`.
   *
   * `skyTint` is the RATIO deck ÷ clear-sky, for converting a colour that already carries the
   * clear sky's hue. The deck here is built from a luminance ({@link domeLum}), which is neutral,
   * and `fillTint` is precisely the grade's term for tinting a neutral — the same distinction
   * `weather.ts` records as a real bug it caught in the frames.
   */
  tint: Vec3
  /**
   * Cosine-weighted mean LUMINANCE of the CLEAR dome, i.e. what the cloudless sky delivers to a
   * horizontal surface. The deck replaces the sky's distribution, so it needs the sky's own energy
   * to replace it WITH — and that is a property of the sun and the turbidity, not of the weather,
   * which is why it is the one term that cannot come from the grade.
   *
   * Hoisted: {@link clearDomeLuminance} costs 512 `skyRadiance` evaluations, which is 0.1 % of a
   * 1024x512 bake, but it does not vary with the view direction so computing it per pixel would be
   * the SKY-HORIZON mistake (87 -> 144 ms) an order of magnitude worse.
   */
  domeLum: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** Preetham distribution coefficients (A..E) per channel as a function of turbidity.
 *  Coefficients are the canonical Preetham xyY-luminance/chromaticity fits. */
interface PerezCoeff {
  A: number
  B: number
  C: number
  D: number
  E: number
}

function perezYCoeff(T: number): PerezCoeff {
  return {
    A: 0.1787 * T - 1.463,
    B: -0.3554 * T + 0.4275,
    C: -0.0227 * T + 5.3251,
    D: 0.1206 * T - 2.5771,
    E: -0.067 * T + 0.3703,
  }
}

function perezxCoeff(T: number): PerezCoeff {
  return {
    A: -0.0193 * T - 0.2592,
    B: -0.0665 * T + 0.0008,
    C: -0.0004 * T + 0.2125,
    D: -0.0641 * T - 0.8989,
    E: -0.0033 * T + 0.0452,
  }
}

function perezyCoeff(T: number): PerezCoeff {
  return {
    A: -0.0167 * T - 0.2608,
    B: -0.095 * T + 0.0092,
    C: -0.0079 * T + 0.2102,
    D: -0.0441 * T - 1.6537,
    E: -0.0109 * T + 0.0529,
  }
}

/** The Perez luminance distribution function.
 *  `cosTheta` = cosine of the view's zenith angle, `gamma` = angle to the sun. */
function perez(c: PerezCoeff, cosTheta: number, gamma: number): number {
  const cosG = Math.cos(gamma)
  // cosTheta can dip toward 0 near the horizon; clamp so the 1/cosTheta term stays
  // finite.
  const ct = Math.max(cosTheta, 0.0001)
  return (1 + c.A * Math.exp(c.B / ct)) * (1 + c.C * Math.exp(c.D * gamma) + c.E * cosG * cosG)
}

/**
 * Zenith luminance below the horizon, continuing the Preetham curve instead of
 * letting it go NEGATIVE.
 *
 * **The bug this fixes.** Preetham's `Yz` is only valid for a sun well above the
 * horizon. At the horizon the `tan` term vanishes and it degenerates to
 * `2.4192 - 0.2155*T`, which (a) makes *hazier* air darker — backwards — and (b)
 * crosses zero at **T = 11.2**. The shipped turbidity curve reaches T = 10 at
 * −12°, and `Yz` is already negative at **−2°** (−0.129). That was being clamped
 * by `Math.max(Y, 0)`, so for roughly six degrees of sun altitude the sky was not
 * dim, it was **exactly (0,0,0)** — while the day/night fade still reported 25–75 %
 * daylight and the lower hemisphere (a separate code path) stayed lit. The result
 * was a pure black upper sky above a grey ground with a hard horizon cut, on every
 * dawn and dusk the time slider passes through. Measured in `v0.31.7.80`: 0.00 mean
 * AND 0 max at −3° and −5°, against Cycles' 39.9–99.6.
 *
 * **What this deliberately does NOT do.** It does not match physics. Cycles wants
 * roughly **6× more light at 20° elevation and 20× at the horizon**
 * (`v0.31.7.81`), which is a re-grade of golden hour and a look decision, not a bug
 * fix. So the continuation is pinned to the app's OWN value at the horizon
 * (`Yz(0°) ≈ 0.695`) and decays from there with the SHAPE Cycles measures — the
 * reference twilight level falls about ten-fold every 2° of altitude. Above the
 * horizon nothing changes at all: the floor is only consulted where Preetham has
 * already gone invalid.
 */
const TWILIGHT_YZ_AT_HORIZON = 0.695
/**
 * Degrees of sun altitude per e-fold of twilight decay.
 *
 * **Corrected from 0.87 in `v0.31.7.116`, and the old comment's reason was wrong.** It said
 * "Cycles: ~10x per 2°", which is neither the displayed nor the level ratio. Derived properly
 * from `v0.31.7.81`'s required-`Yz` anchors — 14.0 at 0°, 4.89 at −2°, 0.112 at −6° — the level
 * falls by `(0.112/14.0)^(1/3) = 0.20` per 2°, i.e. **~5× per 2°**, giving `2/ln(5) = 1.24`.
 * The shipped 0.87 decayed ~40 % faster than the reference it cited.
 */
const TWILIGHT_YZ_SCALE_DEG = 1.24

function twilightZenithY(sunAltDeg: number): number {
  if (sunAltDeg >= 0) return 0
  return TWILIGHT_YZ_AT_HORIZON * Math.exp(sunAltDeg / TWILIGHT_YZ_SCALE_DEG)
}

/** Zenith xyY for the given turbidity + solar zenith angle (Preetham). */
function zenithxyY(T: number, thetaS: number): { Y: number; x: number; y: number } {
  const t2 = T * T
  const ts2 = thetaS * thetaS
  const ts3 = ts2 * thetaS
  const chi = (4 / 9 - T / 120) * (Math.PI - 2 * thetaS)
  const Yz = (4.0453 * T - 4.971) * Math.tan(chi) - 0.2155 * T + 2.4192

  const xz =
    (0.00166 * ts3 - 0.00375 * ts2 + 0.00209 * thetaS) * t2 +
    (-0.02903 * ts3 + 0.06377 * ts2 - 0.03202 * thetaS + 0.00394) * T +
    (0.11693 * ts3 - 0.21196 * ts2 + 0.06052 * thetaS + 0.25886)
  const yz =
    (0.00275 * ts3 - 0.0061 * ts2 + 0.00317 * thetaS) * t2 +
    (-0.04214 * ts3 + 0.0897 * ts2 - 0.04153 * thetaS + 0.00516) * T +
    (0.15346 * ts3 - 0.26756 * ts2 + 0.0667 * thetaS + 0.26688)

  return { Y: Yz, x: xz, y: yz }
}

function xyYtoLinearRGB(x: number, y: number, Y: number): Vec3 {
  // Avoid divide-by-zero for degenerate chromaticities.
  const yy = Math.max(y, 1e-4)
  const X = (x / yy) * Y
  const Z = ((1 - x - y) / yy) * Y
  // CIE XYZ → linear sRGB (Rec.709 primaries).
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z
  return [Math.max(0, r), Math.max(0, g), Math.max(0, b)]
}

/**
 * Elevation (sin of altitude) at which the near-horizon sky colour is sampled when
 * something below the horizon needs "the sky just above me at my azimuth".
 *
 * NOT vanishingly small on purpose: the Perez formula divides by `cos(view zenith)`
 * and `skyRadiance` clamps that to 1e-4, so sampling right AT the horizon lands in
 * the singular region where the value swings steeply — two samples 0.001 apart came
 * out a factor of 1.5 different. ~1.1 degrees up is a genuine near-horizon sky
 * colour and is numerically stable.
 */
export const HORIZON_EPS = 0.02

/** Smoothstep, so a horizon blend has no visible seam or Mach band. */
export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * The direction to sample for "the sky just above the horizon at THIS azimuth".
 *
 * The horizontal part is renormalised so the sample sits at exactly `HORIZON_EPS`
 * elevation for every view direction — passing `[v.x, EPS, v.z]` straight through
 * does NOT, because `v` is a unit vector whose horizontal length shrinks as it
 * tilts, so the effective elevation drifts (0.020 looking level, 0.022 at 30
 * degrees down) and lands back in Perez's steep near-horizon region. That alone
 * once made the orbit surround read BRIGHTER halfway down than just below the
 * horizon, i.e. non-monotonic.
 *
 * Straight down has NO azimuth (`hLen == 0`). A `|| 1` fallback there collapses the
 * sample to [0, EPS, 0] — the ZENITH, the brightest part of the sky — so the
 * underside came out brighter than the horizon. Pick an arbitrary valid azimuth
 * instead; all azimuths converge at the pole anyway.
 */
export function horizonSampleDir(v: Vec3): Vec3 {
  const hLen = Math.hypot(v[0], v[2])
  const flat = Math.sqrt(Math.max(0, 1 - HORIZON_EPS * HORIZON_EPS))
  const ax = hLen > 1e-6 ? v[0] / hLen : 1
  const az = hLen > 1e-6 ? v[2] / hLen : 0
  return [ax * flat, HORIZON_EPS, az * flat]
}

/**
 * Depression (as -sin(elevation)) over which the ground fades out of the horizon
 * haze. SKY-HORIZON: aerial perspective. Looking out of a window the ground near
 * the horizon is seen through kilometres of atmosphere, so it takes the sky's own
 * colour there and only resolves into ground as you look further down. 0.30 is
 * ~17.5 degrees, which covers the depression range a window actually shows from a
 * standing eye height.
 */
const GROUND_HAZE_SPAN = 0.3

/**
 * Cosine-weighted hemispherical mean of the CIE standard overcast distribution `(1 + 2cosθ)/3`.
 *
 * `∫₀¹ (1+2c)/3 · c dc ÷ ∫₀¹ c dc = (7/18)/(1/2) = 7/9`. Dividing the distribution by it makes the
 * deck **energy-normalised**: a deck at `level = 1` delivers exactly the horizontal irradiance the
 * clear dome it replaced did, so {@link SkyWeather.level} is the only term that changes the level.
 * Without this the 3:1 gradient would dim the horizon a second time on top of `fill`, and the
 * horizon is precisely where the orbit camera looks.
 */
const CIE_OVERCAST_COS_MEAN = 7 / 9

/**
 * The cloud deck's angular distribution, normalised so its cosine-weighted mean is 1.
 *
 * Moon & Spencer (1942), the CIE standard overcast sky: `L(θ) = L_z (1 + 2cosθ)/3`. Two properties
 * are the whole point of using it rather than a flat fill. It is **near-uniform** — 3:1 zenith to
 * horizon, against a clear Preetham sky whose near-sun horizon runs 3.5x its own dome average at a
 * low sun — so the gradient and the aureole collapse together, which is what "no sun disc" looks
 * like in a model that never drew a disc. And its polarity is INVERTED from the clear sky's: an
 * overcast sky is brightest overhead and greys down toward the horizon, where a clear one is a
 * saturated zenith over a pale horizon.
 */
export function overcastShape(cosZenith: number): number {
  const c = clamp(cosZenith, 0, 1)
  return (1 + 2 * c) / 3 / CIE_OVERCAST_COS_MEAN
}

/** Stratified sample counts for {@link clearDomeLuminance}: 16 x 32 = 512 evaluations. */
const DOME_ELEV_STEPS = 16
const DOME_AZIM_STEPS = 32

/** Rec.709 relative luminance of a linear-RGB triple. */
function luma(c: Vec3): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/**
 * Cosine-weighted mean luminance of the CLEAR upper hemisphere — the energy a cloud deck has to
 * redistribute. Stratified in `cos θ` (equal-solid-angle-times-cosine bands) so the weights are
 * uniform and 16 elevations suffice for a field this smooth.
 *
 * Always evaluated WITHOUT weather: a deck defined in terms of a deck would be circular, and this
 * is the reference the deck is measured against.
 */
export function clearDomeLuminance(params: SkyParams): number {
  const clear = params.weather ? { ...params, weather: undefined } : params
  let acc = 0
  let wsum = 0
  for (let i = 0; i < DOME_ELEV_STEPS; i++) {
    const c = (i + 0.5) / DOME_ELEV_STEPS
    const s = Math.sqrt(Math.max(0, 1 - c * c))
    for (let j = 0; j < DOME_AZIM_STEPS; j++) {
      const phi = ((j + 0.5) / DOME_AZIM_STEPS) * 2 * Math.PI
      acc += luma(skyRadiance([s * Math.cos(phi), c, s * Math.sin(phi)], clear)) * c
      wsum += c
    }
  }
  return wsum > 0 ? acc / wsum : 0
}

/**
 * Build the deck for a bake from the shipped weather grade, or `undefined` when there is none.
 *
 * **`undefined`, not a neutral deck, is the load-bearing part.** `weatherGrade('clear', …)` returns
 * exact literal `1`s, so `cover` is exactly 0 and this returns `undefined` — and `skyRadiance` then
 * runs the shipped code path with not one extra arithmetic operation in it. A neutral `SkyWeather`
 * would be a lerp by zero, which is *almost* always the same bytes; `clear` is the default
 * condition and "almost" is not the guarantee the default look needs. The same applies at night,
 * where the grade ramps every condition back to identity.
 *
 * Takes the grade structurally rather than importing `weatherGrade`, so this module keeps its
 * "pure, no deps" shape and `weather.ts` stays a contract this file only reads.
 */
export function skyWeather(
  grade: Pick<WeatherGrade, 'sun' | 'fill' | 'fillTint'>,
  params: SkyParams,
): SkyWeather | undefined {
  const cover = clamp(1 - grade.sun, 0, 1)
  if (cover <= 0) return undefined
  return {
    cover,
    level: Math.max(0, grade.fill),
    tint: grade.fillTint,
    domeLum: clearDomeLuminance(params),
  }
}

/**
 * Analytic Preetham sky radiance for a `view` direction (need not be normalised),
 * in **relative linear RGB** (≥ 0). The result is scaled so a clear midday zenith
 * lands near ~0.5–1.0, suitable for an LDR backdrop.
 *
 * Views below the horizon (`view.y < 0`) return a ground tint that darkens toward
 * the nadir — the painter uses this for the lower hemisphere.
 */
export function skyRadiance(view: Vec3, params: SkyParams, hazeSample?: Vec3): Vec3 {
  const T = clamp(params.turbidity, 1.8, 12)
  const sun = normalize(params.sunDir)
  const v = normalize(view)
  const sunAlt = clamp(sun[1], -1, 1) // sin(sun altitude)
  const thetaS = Math.acos(clamp(sunAlt, -1, 1)) // solar zenith angle (0 = overhead)

  // Night factor: as the sun drops below the horizon the whole sky darkens to a
  // deep blue. Fully lit above ~0°, fully dark below ~ -8° altitude.
  const sunAltDeg = Math.asin(sunAlt) * (180 / Math.PI)
  const night = clamp((sunAltDeg + 8) / 8, 0, 1)
  // SEPARATE FADE FOR THE SKY, and it is a bug fix rather than a look change.
  //
  // `night` reaches exactly 0 at −8°, and the sky's final line is `rgb * night` — so below −8°
  // the sky was **identically (0,0,0)** whatever the zenith luminance said. `v0.31.7.80` fixed
  // the negative `Yz` that made the sky black from −2°, and `v0.31.7.81` named this second cause;
  // it was never addressed, so a black band survived from −8° down. Cycles measures 10.5 and 5.4
  // displayed counts at −8° and −10°: dark, not absent.
  //
  // −18° is astronomical twilight, where the sky genuinely does reach zero. The GROUND keeps the
  // −8° fade deliberately: an unlit ground under a faintly glowing sky is what deep twilight
  // looks like, and it also narrows the `(y)`3 sky-under-ground seam rather than widening it.
  //
  // **What this does NOT do.** It does not reach Cycles' levels. Physical twilight at −2° wants
  // `Yz` 4.89 against the app's own horizon value of 0.695 — 7× MORE than the sky directly
  // overhead at sunset — so matching it is impossible while the horizon stays anchored to
  // Preetham, which is the whole-day re-grade explicitly scoped out in `(z)`8. This removes an
  // indefensible hard black cliff; it does not close a 20× gap.
  const skyNight = clamp((sunAltDeg + 18) / 18, 0, 1)

  const groundAlbedo = params.groundAlbedo ?? [0.32, 0.3, 0.28]

  // Lower hemisphere → ground tint, darkening toward the nadir, modulated by the
  // overall day/night level so the night ground stays dark.
  if (v[1] < 0) {
    const k = clamp(0.55 + 0.45 * v[1], 0.08, 1) // brightest at horizon, dim at nadir
    const lvl = 0.12 + 0.88 * night
    const ground: Vec3 = [
      groundAlbedo[0] * k * lvl,
      groundAlbedo[1] * k * lvl,
      groundAlbedo[2] * k * lvl,
    ]
    // SKY-HORIZON: fade the ground out of the horizon haze instead of butting it
    // against the sky. The bare tint above met the sky at a hard edge — measured
    // through the main-bedroom window at 13:00 it stepped 62 luma across one
    // degree of elevation, and the whole lower half read as one flat, featureless
    // slab. Aerial perspective is the missing term: at the horizon the ground is
    // seen through so much atmosphere that it IS the sky's colour, and it only
    // resolves into ground further down. Blending to the near-horizon sky makes
    // the seam vanish by construction (both sides agree in the limit) and gives
    // the lower hemisphere the gradient it never had. The nadir is untouched —
    // `smoothstep` reaches 1 well before straight down.
    // `hazeSample` lets a bulk painter hoist this out of the inner loop: the
    // sample depends ONLY on azimuth, and one equirect COLUMN is one azimuth, so
    // `paintSkyEquirect` computes it w times instead of w*h/2 times. Recursing
    // here per pixel measured 87ms -> 144ms for a 1024x512 bake (+65%), which is
    // main-thread time on every sun move, on the phone tier too.
    const haze = hazeSample ?? skyRadiance(horizonSampleDir(v), params)
    // WEATHER-SKY: the ground is lit BY the dome, so it follows the dome — dimmed by `level` and
    // pulled to the deck's chroma by `tint`, both weighted by `cover`. The haze half needs no
    // treatment: it is a sky sample, and it came back already graded. The horizon stays seamless
    // by the same construction as before — at `v.y -> 0` the blend weight is 0 and only the
    // (graded) sky is visible, whatever the weather did to the ground.
    const w = params.weather
    const lit: Vec3 = w
      ? [
          ground[0] * (1 + (w.level * w.tint[0] - 1) * w.cover),
          ground[1] * (1 + (w.level * w.tint[1] - 1) * w.cover),
          ground[2] * (1 + (w.level * w.tint[2] - 1) * w.cover),
        ]
      : ground
    const t = smoothstep(clamp(-v[1] / GROUND_HAZE_SPAN, 0, 1))
    return [
      haze[0] + (lit[0] - haze[0]) * t,
      haze[1] + (lit[1] - haze[1]) * t,
      haze[2] + (lit[2] - haze[2]) * t,
    ]
  }

  const cosTheta = clamp(v[1], 0.0001, 1) // cos of view zenith angle (= view.y)
  const gamma = Math.acos(clamp(dot(v, sun), -1, 1)) // angle between view and sun

  const cY = perezYCoeff(T)
  const cx = perezxCoeff(T)
  const cy = perezyCoeff(T)

  const z = zenithxyY(T, thetaS)
  // Perez ratio: F(theta, gamma) / F(0, thetaS).
  const denomY = perez(cY, 1, thetaS)
  const denomx = perez(cx, 1, thetaS)
  const denomy = perez(cy, 1, thetaS)

  const Y = (z.Y * perez(cY, cosTheta, gamma)) / (denomY || 1)
  const x = (z.x * perez(cx, cosTheta, gamma)) / (denomx || 1)
  const y = (z.y * perez(cy, cosTheta, gamma)) / (denomy || 1)

  // Zenith luminance Yz is in kcd/m^2 (~tens at midday); normalise to a relative
  // LDR range. The divisor is chosen so a clear midday sky lands near ~0.5–1.0.
  // `Math.max(Y, 0)` alone produced a black sky wherever Preetham went negative;
  // the floor continues the curve instead. Identical above the horizon, where
  // `twilightZenithY` returns 0 and `Y` is positive.
  const Yfloored = Math.max(Y, twilightZenithY(sunAltDeg), 0)
  const rgb = xyYtoLinearRGB(x, y, Yfloored / 22)

  const clear: Vec3 = [rgb[0] * skyNight, rgb[1] * skyNight, rgb[2] * skyNight]
  const w = params.weather
  if (!w) return clear
  // WEATHER-SKY. The deck is the clear dome's own energy (`domeLum`, which already carries
  // `skyNight` — it is an average of these very samples, so do NOT fade it a second time), scaled
  // by `level`, spread over the CIE overcast distribution and coloured by the deck's chroma. Then
  // lerp clear -> deck by `cover`, which is what makes `partlyCloudy` a partial version of the
  // same thing rather than a third case.
  const deck = w.domeLum * w.level * overcastShape(cosTheta)
  return [
    clear[0] + (deck * w.tint[0] - clear[0]) * w.cover,
    clear[1] + (deck * w.tint[1] - clear[1]) * w.cover,
    clear[2] + (deck * w.tint[2] - clear[2]) * w.cover,
  ]
}

/** Linear → sRGB (gamma) for an 8-bit framebuffer byte. */
export function encodeByte(linear: number): number {
  const c = clamp(linear, 0, 1)
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
  return clamp(Math.round(s * 255), 0, 255)
}

/** Map an equirectangular pixel (col, row) to a scene-space view direction.
 *  Row 0 = zenith-ward top, row h = nadir; column wraps 0..2π in azimuth.
 *  +X east, +Y up, +Z south — consistent with `sunDirectionToScene`. */
export function equirectDir(col: number, row: number, w: number, h: number): Vec3 {
  const u = (col + 0.5) / w
  const t = (row + 0.5) / h
  const phi = u * 2 * Math.PI - Math.PI // azimuth
  const theta = t * Math.PI // 0 at top (zenith) → π at bottom (nadir)
  const sinTheta = Math.sin(theta)
  // y = cos(theta): +1 at top, -1 at bottom.
  return [Math.sin(phi) * sinTheta, Math.cos(theta), -Math.cos(phi) * sinTheta]
}

/**
 * Paint the analytic sky into an equirect RGBA byte buffer (`buf` length = w*h*4).
 * Pure — no canvas; the adapter copies the buffer into an ImageData/CanvasTexture.
 */
export function paintSkyEquirect(buf: Uint8ClampedArray, w: number, h: number, params: SkyParams) {
  // One column = one azimuth, and the below-horizon haze sample depends only on
  // azimuth, so hoist it: w samples instead of one per lower-hemisphere pixel.
  // Taken from the middle row, where the direction is horizontal and its
  // horizontal length is 1 (the top row is near the pole, where azimuth degrades).
  const hazeByCol: Vec3[] = new Array(w)
  const midRow = Math.floor(h / 2)
  for (let col = 0; col < w; col++) {
    hazeByCol[col] = skyRadiance(horizonSampleDir(equirectDir(col, midRow, w, h)), params)
  }
  let i = 0
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const dir = equirectDir(col, row, w, h)
      const rgb = skyRadiance(dir, params, dir[1] < 0 ? hazeByCol[col] : undefined)
      buf[i] = encodeByte(rgb[0])
      buf[i + 1] = encodeByte(rgb[1])
      buf[i + 2] = encodeByte(rgb[2])
      buf[i + 3] = 255
      i += 4
    }
  }
}
