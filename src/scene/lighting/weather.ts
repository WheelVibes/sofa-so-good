/**
 * WEATHER-GRADE — how a sky condition changes the light in a room. Pure, no three.js.
 *
 * `timeSlice.ts` has carried `weather: WeatherCondition` since `v0.34.1.31` and nothing in the
 * render path read it, which is why `FEATURE_FLAGS.weatherConditions` shipped `default: false`.
 * This module is what the render path reads.
 *
 * ## The one idea
 *
 * **An overcast sky is not a dimmer clear sky — it is a different DISTRIBUTION.** The direct beam
 * goes to nearly zero and the whole dome becomes the source. So the grade moves energy between two
 * terms rather than scaling one:
 *
 * | term | what it is in this renderer |
 * | --- | --- |
 * | {@link WeatherGrade.sun} | the `DirectionalLight` in `Lighting.tsx` — the only shadow-casting light |
 * | {@link WeatherGrade.fill} | hemisphere + ambient + the IBL probe, i.e. every positionless term |
 * | {@link WeatherGrade.bounce} | the BAKED interior GI (`scene/visibilityLightmap.ts`) — added `v0.34.1.x` |
 *
 * A grade that only dimmed would keep the sun's hard shadow and just darken it, which is the one
 * thing an overcast room never has.
 *
 * **`bounce` is a THIRD term and not a synonym for `fill`, and that was measured rather than
 * assumed.** The baked map was made with the sun removed as a SOURCE (`with_sun_disc: false`), so
 * it holds the sky DOME alone — and a stratus deck delivers ~96 % of a clear sky's dome while
 * delivering ~40 % of a clear sky's ROOM. Multiplying the bake by `fill` would take the beam out
 * twice. Full table, the app-side sweep and the one arm that is a look call: {@link BOUNCE}.
 *
 * ## Where the numbers come from
 *
 * ### Outdoors: Kasten & Czeplak (1980), global transmittance relative to a clear sky
 *
 * | condition | model | G / G_clear |
 * | --- | --- | --- |
 * | `clear` | 0 oktas | 1.00 |
 * | `partlyCloudy` | 4 oktas via `G/G₀ = 1 − 0.75·(N/8)^3.4` | 0.929 |
 * | `overcast` | stratus, their per-cloud-type mean | 0.18 |
 * | `rain` | nimbostratus, same table | 0.16 |
 *
 * Two of those are worth stating because they are not what intuition says: **rain is only ~11 %
 * darker outdoors than plain overcast**, and **partly cloudy is barely darker than clear at all**.
 * The visible difference in both cases is redistribution, not level.
 *
 * ### Indoors: Cycles, because the outdoor ratio does not survive an aperture
 *
 * A room is lit through a vertical window. At the app's default 13:00 the Singapore sun sits at
 * **87°**, so the beam arrives at `cos 87° ≈ 0.05` on a vertical surface and barely enters at all —
 * the interior is diffuse-lit under EVERY condition, and the outdoor transmittance is the wrong
 * number to reach for. `python/scripts/blender/render_weather.py` renders the exported scene under
 * each calibrated sky; `scripts/dev-probes/weather-cycles.mjs` reads the interior in linear.
 * Measured at the `living-far` pose (masked to the room, 256 samples):
 *
 * | condition | interior mean | p50 | top decile |
 * | --- | --- | --- | --- |
 * | `clear` | 1.000 | 1.000 | 1.000 |
 * | `partlyCloudy` | 2.186 | 2.502 | 2.265 |
 * | `overcast` | 0.728 | 0.713 | 0.831 |
 * | `rain` | 0.649 | 0.633 | 0.743 |
 *
 * ### Why the shipped numbers are not those numbers
 *
 * That Cycles run has **two known biases and they push the same way** — both make the `clear` arm
 * too dim, so both overstate how bright a cloudy room is relative to it:
 *
 * 1. **Blender's atmosphere is too clean for the tropics.** Measured on the same sky node, its
 *    clear-sky diffuse fraction is `k_d = 0.096`; a humid equatorial sky runs ~0.20–0.25. The
 *    cloud dome is solved against GLOBAL irradiance, so a too-small clear diffuse share inflates
 *    every dome-to-sky ratio.
 * 2. **The exported scene has no neighbours.** `scene/estate/Estate.tsx` is `noExport`, so the
 *    window sees an unobstructed sky where a real HDB flat sees slab blocks at 50–110 m. Under a
 *    clear sky those blocks are sunlit and bright; under a deck they are dim.
 *
 * Redoing the aperture arithmetic with a tropical `k_d = 0.22` and a 0.2 ground gives
 * `partlyCloudy 1.44`, `overcast 0.39`, `rain 0.35`. The two estimates bracket the answer, so the
 * shipped fill is between them — `overcast` 0.55 against Cycles 0.73 and analytic 0.39, `rain`
 * 0.48 against 0.65 / 0.35.
 *
 * `partlyCloudy` is the one place this deliberately ships SHORT of both estimates (**1.15** against
 * 1.44 and 2.19). Both estimates agree a half-covered sky puts *more* light through a vertical
 * window than a clear one — the dome grows faster than the beam is lost — and that is real. But
 * the app's `clear` baseline already contains a sun contribution to interior surfaces that the
 * Cycles `clear` arm structurally lacks (its glazing seals the room to next-event estimation, so
 * its apertures are opened and its beam still barely enters), which means the app's clear interior
 * sits relatively higher and the honest ratio is smaller than either estimate. 1.15 keeps the
 * direction and the softening without a brightness jump on a picker whose other three entries all
 * darken.
 *
 * ### What the PHOTOGRAPHS said: nothing, and that is a result
 *
 * `scripts/dev-probes/weather-photos.mjs` labels the 32-image corpus at `/tmp/refs/final` by
 * whether a direct beam is visible in the room (8 `beam`, 9 `diffuse`, 13 excluded, 2 dropped as
 * byte-identical duplicates). **Not one of the nine whole-frame metrics separates the two
 * classes** — not `p05`, not `range`, not `nearWhite`, not `warmth`. Within-class framing spread
 * swamps the between-class difference, which is exactly the limit the corpus notes record
 * ("qualitative screening and pose-robust bounds"). So the photographs contribute the qualitative
 * target — flat, neutral, a bright but unblown window, no cast patch — and no number. They are
 * recorded here so nobody re-runs them expecting one.
 *
 * ## Colour
 *
 * A cloud deck is a ~6500–7300 K source; the clear sky the app models is a strongly blue
 * `[0.55, 0.66, 0.92]` hemisphere plus a warm sun. So the tint here is the ratio of the cloud
 * deck's chroma to the clear sky's, and the frame gets cooler mostly by LOSING the warm beam
 * rather than by being tinted blue. `daylightChroma` is the CIE D-series locus, so D65 comes back
 * neutral by construction — the check that the chain is right, since D65 *is* the sRGB white point.
 *
 * ## Rule 8 — every term is scaled by the source it came from
 *
 * `src/scene/CLAUDE.md` rule 8: *"every term the injection writes must be scaled by the source it
 * came from"*. Weather is a property of DAYLIGHT. After dark there is no beam to remove and no
 * dome to brighten, and a room lit by its own lamps looks the same in any weather — so every term
 * here ramps to identity with `daylightFromAltitude`, and at night the grade is exactly `clear`.
 */

import type { WeatherCondition } from '../../state/slices/timeSlice'
import { daytimeSkyTint } from './altitudeCurve'

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0)

/** Kasten & Czeplak (1980) global transmittance relative to a clear sky. See the module doc. */
export const GLOBAL_TRANSMITTANCE: Record<WeatherCondition, number> = {
  clear: 1,
  partlyCloudy: 1 - 0.75 * (4 / 8) ** 3.4,
  overcast: 0.18,
  rain: 0.16,
}

/**
 * Direct-beam multiplier on the shadow-casting `DirectionalLight` at full day.
 *
 * `overcast` and `rain` are **exactly zero**, not a small residual. Under a full stratus or
 * nimbostratus deck the direct normal irradiance really is ~0 — the deck's transmittance in the
 * table above is entirely diffuse — and the visible consequence is the one the goal asks for: no
 * cast shadows at all. `partlyCloudy` is the cover fraction: at 4 oktas the disc is obscured half
 * the time, and a single rendered frame is the time-average of that, which reads as a hazy sun.
 */
export const BEAM: Record<WeatherCondition, number> = {
  clear: 1,
  partlyCloudy: 0.5,
  overcast: 0,
  rain: 0,
}

/** Positionless-fill multiplier at full day — hemisphere + ambient + IBL probe. See the module doc
 *  for the bracket each of these sits inside and why `partlyCloudy` ships short of it. */
export const FILL: Record<WeatherCondition, number> = {
  clear: 1,
  partlyCloudy: 1.15,
  overcast: 0.55,
  rain: 0.48,
}

/**
 * BAKED-BOUNCE multiplier at full day — the baked interior GI (`scene/visibilityLightmap.ts`).
 *
 * **This is NOT {@link FILL}, and the difference is the whole point of the term.** The obvious
 * candidate was `fill`, on the argument that the bake is an indirect term and `fill` is what
 * multiplies every other indirect source. It is the wrong family, because the bake is not the same
 * quantity as the room: `public/assets/lightmaps/index.json` records the shipped set as
 * `--pass irradiance` with **`with_sun_disc: false`**, i.e. the sun is removed as a SOURCE and the
 * map holds only what the sky DOME delivers (through the aperture and via every bounce). The beam
 * is the app's `DirectionalLight`, graded separately by {@link BEAM}.
 *
 * And a stratus deck delivers about as much DOME as a clear sky does. All of the following are one
 * self-consistent Cycles set — the app's own exported scene at the `living-far` pose,
 * `render_weather.py`, 256 samples, GPU, `--linear-stops -1` so nothing clips, read in LINEAR on
 * two wall patches (`scripts/dev-probes/weather-baked-gi.mjs:MAPPED`):
 *
 * | overcast ÷ clear | east wall | west wall |
 * | --- | --- | --- |
 * | the ROOM (sun disc ON) | 0.439 | 0.346 |
 * | **the DOME alone (disc OFF — the bake's own configuration)** | **0.938** | **0.992** |
 *
 * The room loses ~60 % of its light under a deck; the bake's own quantity loses ~4 %. What leaves
 * is the BEAM, and `sun → 0` already removes it. Scaling the bake by `fill` as well would remove it
 * a second time.
 *
 * **The app's decomposition is faithful, which is what makes that transferable.** On the same two
 * patches the clear-sky wall is **39 % / 35 %** baked term in the app against **47 % / 35 %** dome
 * in Cycles (the rest vanishing with the disc in both). So applying the dome ratio lands the app's
 * mapped walls at 0.370 / 0.349 against Cycles' 0.439 / 0.346 — and `fill` would land them at
 * 0.217 / 0.194, less than half of physics.
 *
 * ### The one arm that is deliberately NOT the measurement, and it is a maintainer call
 *
 * `partlyCloudy` measures **2.68** and ships at **1.15**. Blender's clear sky is too clean for the
 * tropics — this harness measures its diffuse fraction at `k_d = 0.096` against a real 0.20–0.25 —
 * and since every number above is normalised by that same clear DOME, the bias inflates them all;
 * it inflates `partlyCloudy` most, because that world carries the largest solved dome. Re-doing the
 * denominator at a tropical `k_d = 0.22` gives `partlyCloudy` **1.17**, which is `FILL`'s own 1.15
 * to within rounding. Two reasons to take it there and not at the other two arms:
 *
 * 1. The same correction would put `overcast` at 0.42 and `rain` at 0.37, and the app-side sweep
 *    REFUTES those (the walls land at 0.165 / 0.148 against physics' 0.439 / 0.346). It refutes
 *    them because the shipped MAP is itself a Blender-dome bake whose `IRRADIANCE_GAIN` was fitted
 *    against a Blender reference — the app inherited the bias, so the uncorrected ratio is the one
 *    that is right *for this asset*. **If the atmosphere model is ever fixed and the maps re-baked,
 *    this term must be re-fitted with them.**
 * 2. `partlyCloudy` is the one condition that BRIGHTENS, and `FILL` already ships short of both its
 *    own estimates there on a stated product argument ("a picker whose other three entries all
 *    darken"). At 2.68 the bake would be 2.3× the fill, so a mapped wall and the unmapped wall
 *    beside it would visibly disagree — the LIVING-SLAB asymmetry, on the one arm where it would
 *    read as a brightness jump. The app-side sweep does favour 2.68 (wall 1.359 against Cycles'
 *    1.469, where 1.15 gives 0.756), so this is a look call, not a measurement, and it is flagged
 *    as one rather than buried.
 */
export const BOUNCE: Record<WeatherCondition, number> = {
  clear: 1,
  partlyCloudy: 1.15,
  overcast: 0.95,
  rain: 0.86,
}

/**
 * WEATHER-BOUNCE-RECALIBRATE (audit item z19, `docs/open-graphics-decisions.md`). {@link BOUNCE}
 * above is fitted against a DOME-ONLY bake — the app's shipped set at the time it was measured
 * ran `with_sun_disc: false`. `SUN-BOUNCE-BAKE` (v0.35.1.0, see `CHANGELOG.md`) later composed
 * the sun's OWN bounces into that same map (`A + (B - C)` per texel), lifting it `ceilings x2.48,
 * walls x1.70, floors x1.96` over the dome-only term — so a `share` of what {@link BOUNCE} now
 * scales is sun-bounce, not dome, and under a full deck that share should fall toward
 * {@link FILL} (the sun is gone; `grade.sun = 0` already removes the app's own beam), not stay
 * pinned at the dome ratio the way the whole composed map currently does.
 *
 * z19 files this as a maintainer call rather than a fix, because there is no ground truth for
 * how the two terms actually split once composed into one map — only the OFFLINE ratio each
 * orientation's bake moved by. {@link sunBounceShare} treats that offline ratio as the runtime
 * share too (`share = 1 - 1/ratio`, i.e. "the fraction of the composed map's ENERGY that the sun
 * pass added"), which is the most direct reading of the number actually measured, not a new one.
 *
 * `orientation` matches `applyVisibilityLightmaps.ts:surfaceOrientation` exactly (`'down'` =
 * ceiling, `'side'` = wall, `'up'` = floor) so a caller can pass it straight through without a
 * lookup table of its own.
 */
export const SUN_BOUNCE_ORIENTATION_RATIO: Record<'up' | 'down' | 'side', number> = {
  down: 2.48, // ceiling
  side: 1.7, // wall
  up: 1.96, // floor
}

/** The composed bake's sun-bounce share for one surface orientation — see
 *  {@link SUN_BOUNCE_ORIENTATION_RATIO}'s doc comment for the formula and its provenance. */
export function sunBounceShare(orientation: 'up' | 'down' | 'side'): number {
  return 1 - 1 / SUN_BOUNCE_ORIENTATION_RATIO[orientation]
}

/**
 * Which conditions {@link sunBounceShare}'s split actually applies to: `overcast`/`rain` only.
 *
 * `clear` needs no correction — `fill` is 1 there by definition, which already makes the split a
 * no-op (`visDayScale`'s `1 - share * (1 - fill)` collapses to 1). `partlyCloudy` is excluded on
 * purpose: its own {@link BOUNCE} entry (1.15) is already a documented LOOK call, not a
 * measurement — see this module's "one arm that is deliberately NOT the measurement" — and
 * running it through a mechanical split would silently overwrite that taste decision with an
 * unrelated one. Returns `fill` unchanged for `overcast`/`rain`, or `1` (no-op) otherwise, so a
 * caller can pass the result straight into `visibilityLightmap.ts:setVisDayLevel`'s `fill` param.
 */
export function bounceRecalibrationFill(condition: WeatherCondition, fill: number): number {
  return condition === 'overcast' || condition === 'rain' ? fill : 1
}

/**
 * Correlated colour temperature of the cloud deck, K, and how much of the diffuse it supplies.
 *
 * A stratus deck sits near D65. A rain-bearing nimbostratus deck is optically thicker, scatters
 * more short-wavelength light out of the beam, and reads colder. At 4 oktas the deck supplies
 * `0.429 / 0.514 = 0.83` of the total diffuse (the rest is still blue sky), so its chroma is
 * blended in at that weight rather than applied whole.
 */
const DECK: Record<WeatherCondition, { cct: number; share: number }> = {
  clear: { cct: 6500, share: 0 },
  partlyCloudy: { cct: 6500, share: 0.83 },
  overcast: { cct: 6600, share: 1 },
  rain: { cct: 7300, share: 1 },
}

/**
 * CIE D-series daylight chromaticity at `cct` K → linear sRGB, normalised to **luminance 1**.
 *
 * Luminance-normalised, not peak-normalised, for the same reason `daytimeSkyTint()` is: the tint
 * must carry chroma ONLY. A peak-normalised colour is dimmer the further it sits from neutral, so
 * it would smuggle a brightness change into what is meant to be a hue change — and the brightness
 * belongs to {@link FILL}, which is fitted separately.
 *
 * Ported from `python/scripts/blender/weather_sky.py:daylight_linear_srgb`, and pinned against it
 * in the test. D65 returns `[1, 1, 1]` to within rounding, which is the check that the whole
 * xy → XYZ → linear-sRGB chain is right.
 */
export function daylightChroma(cct: number): [number, number, number] {
  const t = Number.isFinite(cct) ? Math.min(25000, Math.max(4000, cct)) : 6500
  const x =
    t <= 7000
      ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + (0.09911e3 / t + 0.244063)
      : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + (0.24748e3 / t + 0.23704)
  const y = -3.0 * x * x + 2.87 * x - 0.275
  const bigX = x / y
  const bigZ = (1 - x - y) / y
  const rgb: [number, number, number] = [
    Math.max(0, 3.2406 * bigX - 1.5372 - 0.4986 * bigZ),
    Math.max(0, -0.9689 * bigX + 1.8758 + 0.0415 * bigZ),
    Math.max(0, 0.0557 * bigX - 0.204 + 1.057 * bigZ),
  ]
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
  if (luma <= 0) return [1, 1, 1]
  return [rgb[0] / luma, rgb[1] / luma, rgb[2] / luma]
}

export interface WeatherGrade {
  /** Multiplier on the graded sun intensity. `0` for a full deck: no beam, therefore no shadows. */
  sun: number
  /** Multiplier on every positionless term — hemisphere, ambient, IBL probe, orbit studio key. */
  fill: number
  /**
   * Multiplier on the BAKED interior bounce (`scene/visibilityLightmap.ts:setVisDayLevel`).
   *
   * Separate from {@link fill} because it is a different quantity, and conflating them is a real
   * 2× error rather than a tidiness point: the bake was made with the sun removed as a SOURCE
   * (`with_sun_disc: false`), so it holds the sky DOME alone, and a deck delivers ~96 % of a clear
   * sky's dome where it delivers ~40 % of a clear sky's ROOM. The missing 60 % is the beam, which
   * {@link sun} already takes to zero. See {@link BOUNCE} for the full table and the one arm that
   * is a look call.
   */
  bounce: number
  /**
   * Chroma-only multiplier for a colour that already carries the CLEAR SKY's chroma — i.e. the
   * hemisphere light's `skyColor`. It is a RATIO (deck ÷ clear sky), so it converts one hue into
   * the other and must not be applied to anything neutral.
   */
  skyTint: [number, number, number]
  /**
   * Chroma-only multiplier for a colour that is currently NEUTRAL — the flat `ambientLight`.
   *
   * Separate from {@link skyTint} because the two are different quantities, and conflating them
   * was a real bug caught in the frames: `ambientLight` is white, so multiplying it by the RATIO
   * (which for a 6600 K deck is `[1.18, 0.99, 0.72]`) made the flat fill visibly WARM rather than
   * neutral — the opposite of what a cloud deck does. This is the deck's absolute chroma, which
   * for stratus is ~neutral and for a rain deck is slightly cold.
   */
  fillTint: [number, number, number]
  /**
   * Multiplier on the window-blowout ratio (`estate/Estate.tsx:exteriorDayBoost`).
   *
   * Derived, not chosen: a window blows out because the OUTSIDE is receiving more than the room,
   * so the ratio is `exterior ÷ interior` = {@link GLOBAL_TRANSMITTANCE} ÷ {@link FILL}. Under a
   * deck that lands near **1/3**, which is the goal's "a window that barely blows out" falling out
   * of the same two numbers rather than being a third one to pick.
   */
  blowout: number
}

/** The identity grade. Returned for `clear` at every hour, and for every condition at night. */
const NEUTRAL: WeatherGrade = {
  sun: 1,
  fill: 1,
  bounce: 1,
  skyTint: [1, 1, 1],
  fillTint: [1, 1, 1],
  blowout: 1,
}

/**
 * The grade for a condition at a given daylight level.
 *
 * `daylight` is `altitudeCurve.ts:daylightFromAltitude(altitude)` — 1 whenever the sun is up, 0 by
 * civil dusk. **Not** `lightingFromAltitude(alt).sun`, which is the BEAM strength and already
 * falls to 0.32 by 10° elevation: using it would make a late-afternoon overcast almost as bright
 * as a clear one, because the weather term would have faded out exactly where the beam it is
 * meant to remove is still doing visible work.
 *
 * Byte-identical for `clear`: every field is an exact literal, not a computation that happens to
 * land on 1. That matters more than it looks — `clear` is the default condition, so a user who
 * never opens the picker must get the shipped render, and a float that rounds to 1 is not the
 * same guarantee as the number 1.
 */
export function weatherGrade(condition: WeatherCondition, daylight: number): WeatherGrade {
  if (condition === 'clear') return NEUTRAL
  const d = clamp01(daylight)
  if (d <= 0) return NEUTRAL
  const beam = BEAM[condition] ?? 1
  const fill = FILL[condition] ?? 1
  const bounce = BOUNCE[condition] ?? 1
  const transmittance = GLOBAL_TRANSMITTANCE[condition] ?? 1
  const deck = DECK[condition] ?? DECK.clear

  // The clear sky's own chroma, luminance-normalised — the thing the deck's chroma replaces.
  const sky = daytimeSkyTint()
  const chroma = daylightChroma(deck.cct)
  const full: [number, number, number] = [
    sky[0] > 0 ? chroma[0] / sky[0] : 1,
    sky[1] > 0 ? chroma[1] / sky[1] : 1,
    sky[2] > 0 ? chroma[2] / sky[2] : 1,
  ]
  // Two lerps to identity, both on `d`: the deck's SHARE of the diffuse, then the day level.
  const w = deck.share * d
  return {
    sun: 1 + (beam - 1) * d,
    fill: 1 + (fill - 1) * d,
    bounce: 1 + (bounce - 1) * d,
    skyTint: [1 + (full[0] - 1) * w, 1 + (full[1] - 1) * w, 1 + (full[2] - 1) * w],
    fillTint: [1 + (chroma[0] - 1) * w, 1 + (chroma[1] - 1) * w, 1 + (chroma[2] - 1) * w],
    blowout: 1 + (transmittance / fill - 1) * d,
  }
}
