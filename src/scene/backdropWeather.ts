/**
 * WEATHER-BACKDROP — the static photo backdrops (`city` / `dusk` / `park` / `hills`) under a
 * cloud deck. Pure: preset in, preset out, no canvas and no three.js.
 *
 * ## The gap this closes
 *
 * WEATHER-SKY gave the *procedural* sky a deck, on both surfaces that paint it. The four STATIC
 * presets were untouched, so a user who picked `city` and then picked `rain` got a graded grey
 * room in front of a cloudless blue skyline. That is the one failure mode the whole weather
 * feature exists to avoid, and it is worse than the original defect it fixed, because the
 * contradiction is inside a single frame.
 *
 * ## Why GRADE and not SWAP
 *
 * The presets are not photographs. `backdropEquirect.ts` paints each one procedurally from a
 * handful of authored colours — so the cheapest thing that is not a lie is to move those colours,
 * and it costs **nothing at runtime**: the equirect is already re-baked whenever the hour crosses a
 * quantisation step (`presetForDaylight`), and weather enters the same bake as one more dependency.
 * Authoring four more presets would double the art surface and still not respond to `partlyCloudy`;
 * a fog volume would be a per-frame cost for a backdrop that is a single background texture with
 * zero draw calls.
 *
 * ## The three terms are the SHIPPED grade's own, not a second weather model
 *
 * Exactly the discipline `skyGradient.ts:skyWeather` established, for the same reason: two weather
 * models in one frame will disagree, and the one the user sees is not the one that was fitted.
 *
 * | term | is | why |
 * | --- | --- | --- |
 * | `cover` | `1 - grade.sun` | `BEAM` is documented as the cover fraction — the beam lost and the dome covered are one number |
 * | `level` | `grade.fill` | the multiplier the grade already puts on the dome |
 * | `tint` | `grade.fillTint` | the deck's ABSOLUTE chroma, because step 1 has already taken the authored chroma OUT |
 *
 * **`level` inherits a known, recorded trade-off and does not invent a way around it.**
 * `src/scene/CLAUDE.md`'s WEATHER-SKY entry measures that `fill` (0.55 overcast) is fitted through
 * a VERTICAL APERTURE and is therefore darker than the dome-to-dome ratio a *sky* wants (~0.82),
 * so the shipped deck is on the moody side of a real one. Using anything else here would make the
 * static backdrop and the procedural sky disagree about how dark the same weather is, for a
 * brightness call that is already filed as a maintainer decision. When that call is taken and
 * `weather.ts` exports a dome term, this module and `skyWeather` both switch to it together.
 *
 * ## Why the tint is applied LAST, after a desaturation
 *
 * WEATHER-CONDITIONS records the bug this avoids: **a chroma ratio is only valid against the
 * chroma it was divided by.** The preset's sky hexes carry a clear-sky blue, so the correct
 * multiplier for *them* would be the ratio `skyTint`; the ground and the buildings are near
 * neutral, so the correct multiplier for *those* is the absolute `fillTint`. Rather than carry two
 * tints and a per-colour classification of which is which — and get one of them wrong — the grade
 * removes the authored chroma first (step 1, weighted by `cover`) and then applies the absolute
 * deck chroma to what is left. At full cover the authored blue is gone and the deck's own colour is
 * applied whole, which is exactly what a stratus deck does to a view; at zero cover both weights
 * are zero and nothing happens at all.
 */
import type { Preset } from './backdropEquirect'
import type { WeatherGrade } from './lighting/weather'

/**
 * How much of the authored chroma a full deck removes.
 *
 * **This is a CONVERSION, not a grade, and the distinction is where the usual number comes from.**
 * Colour-grading guidance for an "overcast look" is around −10 to −20 % saturation — but that is
 * for a frame that was *already shot* under cloud. These presets are authored SUNNY: `city`'s sky
 * is `#6fb0e8`, a strongly saturated blue. Turning that into a deck is most of its chroma, not a
 * tenth of it.
 *
 * Not 1 either: a fully desaturated backdrop is a greyscale photograph, and even the flattest
 * overcast view keeps some colour. 0.70 leaves roughly a third of the original saturation, which
 * reads as "the colour has gone out of the day" rather than as a monochrome filter. Worth knowing
 * that the photography and grading literature disagree on the SIGN here — diffuse overcast light
 * *raises* apparent saturation on a vivid near-field subject and only greys out dull ones — but a
 * distant skyline is the dull, aerial-perspective-dominated case, so desaturate is right and the
 * rule must not be carried over to a red sofa.
 */
const DESATURATE = 0.7

/**
 * How far a full deck pulls every colour toward the scene's own haze grey.
 *
 * This is the CONTRAST term, and it is separate from {@link DESATURATE} because they are different
 * defects of a sunny backdrop under cloud: saturation is chroma, this is dynamic range. A deck
 * scatters the whole depth of the view, so the far buildings and the near ones converge and the
 * sky-to-ground step shrinks — the classic flat overcast frame ("no strong shadows or highlights,
 * with everything in the midtone range"). It also lifts the darkest values off the floor, which is
 * the second half of the same standard recipe: haze never lets a distant black stay black. 0.32 is
 * deliberately the smaller of the two terms: past about a third the skyline stops reading as a
 * skyline.
 *
 * Note what is NOT here: a separate exposure drop. Overcast is 2–5 stops down from full sun
 * outdoors, but a camera re-exposes, so an overcast PHOTOGRAPH is not three stops darker — the
 * perceptual cue is compressed range and lost sparkle. The level this module does apply
 * (`grade.fill`) already carries the brightness half, so adding an exposure term on top would
 * double-count it.
 */
const FLATTEN = 0.32

/** Rec.709 luma of an 0..255 triple. */
function luma(c: readonly [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/** `#rrggbb` → 0..255 triple; `null` on anything else (`windowColor` is `rgba(...)`). */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(c: readonly [number, number, number]): string {
  return `#${c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** The three scalars a preset is graded by. Derived only from a {@link WeatherGrade}. */
export interface BackdropWeather {
  /** 0 clear … 1 full deck. `1 - grade.sun`. */
  cover: number
  /** Level multiplier. `grade.fill`. */
  level: number
  /** The deck's absolute chroma. `grade.fillTint`. */
  tint: readonly [number, number, number]
}

/**
 * Build the backdrop's weather terms from the shipped grade, or `undefined` for a sky that does
 * not change the view.
 *
 * `undefined` rather than an identity object, for the same reason `skyWeather` returns it: the
 * caller can then skip the whole transform and hand the painter the *authored* preset object, so
 * `clear` — the default condition — runs the shipped code path with not one extra arithmetic
 * operation and no chance of a rounding difference. The same holds at night for every condition,
 * because `weatherGrade` ramps to the exact identity there.
 */
export function backdropWeather(grade: WeatherGrade): BackdropWeather | undefined {
  const cover = 1 - grade.sun
  if (cover <= 0 && grade.fill === 1) return undefined
  return { cover, level: grade.fill, tint: grade.fillTint }
}

/**
 * Grade one preset for the weather. Returns the input object unchanged when `w` is `undefined`.
 *
 * Applied AFTER `presetForDaylight`, not before: the hour grade tints toward the sun's own colour
 * and brightens the lit windows, and weather then removes the chroma that grade put in. Running it
 * the other way round would re-saturate a deck with the hour's blue.
 */
export function presetForWeather(preset: Preset, w?: BackdropWeather): Preset {
  if (!w) return preset
  const cover = Math.max(0, Math.min(1, w.cover))
  const level = Number.isFinite(w.level) ? Math.max(0, w.level) : 1
  // The reference grey every colour is pulled toward: the preset's OWN haze, stripped to a
  // luminance so the pull cannot smuggle a hue in before the deck's chroma is applied.
  const hazeRef = luma(parseHex(preset.haze) ?? [200, 200, 200])
  const gradeRgb = (c: readonly [number, number, number]): [number, number, number] => {
    const y = luma(c)
    const out: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      const desaturated = c[i] + (y - c[i]) * (DESATURATE * cover)
      const flattened = desaturated + (hazeRef - desaturated) * (FLATTEN * cover)
      out[i] = Math.max(0, Math.min(255, flattened * (w.tint[i] ?? 1) * level))
    }
    return out
  }
  const grade = (hex: string): string => {
    const c = parseHex(hex)
    return c ? toHex(gradeRgb(c)) : hex
  }
  // The numeric triples (`building` / `foliage`) take the SAME grade, via the same code path, so a
  // silhouette cannot drift from the sky it is drawn against. Left ungraded, the city's buildings
  // held byte 141 under a `rain` sky that had fallen to 92 — a backlit skyline rendering brighter
  // than the sky behind it, which is the single most legible way to get a deck wrong.
  const hazed = gradeRgb(parseHex(preset.haze) ?? [200, 200, 200])
  return {
    ...preset,
    sky: [grade(preset.sky[0]), grade(preset.sky[1]), grade(preset.sky[2])],
    ground: [grade(preset.ground[0]), grade(preset.ground[1])],
    haze: grade(preset.haze),
    building: preset.building && gradeRgb(preset.building),
    foliage: preset.foliage && gradeRgb(preset.foliage),
    // Atmospheric perspective now fades toward the DECK rather than toward white, lerped in by
    // cover so `clear` still gets the shipped `undefined` (see `Preset.atmosphere`).
    atmosphere: [
      255 + (hazed[0] - 255) * cover,
      255 + (hazed[1] - 255) * cover,
      255 + (hazed[2] - 255) * cover,
    ],
  }
}
