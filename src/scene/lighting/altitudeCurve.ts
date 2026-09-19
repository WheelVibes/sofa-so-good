const DEG = Math.PI / 180

export interface LightingValues {
  sun: number
  ambient: number
  sunColor: [number, number, number]
  /** Hemisphere sky tint — light arriving from above (RGB 0..1). */
  skyColor: [number, number, number]
  /** Hemisphere ground-bounce tint — light arriving from below (RGB 0..1). */
  groundColor: [number, number, number]
}

export interface SkyValues {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
}

interface LightingKey {
  altDeg: number
  values: LightingValues
}

interface SkyKey {
  altDeg: number
  values: SkyValues
}

/**
 * Sorted by altitude descending.
 *
 * ## ⚠️ The TOP KEY IS 30°, so the sun is FLAT from 30° to 90° (item `(z3)`, measured `v0.31.7.256`)
 *
 * `bracket()` returns `keys[0]` unchanged for any `altDeg >= keys[0].altDeg` (line ~142), so every
 * altitude above 30° gets `sun: 1.0`. Measured in the running app: `dirLight.intensity` is 1.000 at
 * 13:00 (elevation 83.9°) and 1.000 at 17:00 (31.0°), and 0.9913 at 09:00 (28.8°).
 *
 * That is not what a direct beam does. Air mass — Kasten-Young — falls from 1.99 at 30° to 1.00 at
 * 85°, so at a clear-sky optical depth of 0.25 the beam should span a **21 % range** across exactly
 * the region this table flattens:
 *
 * | elevation | air mass | beam, normalised to 85° |
 * | --- | --- | --- |
 * | 85° | 1.00 | 1.000 |
 * | 60° | 1.15 | 0.963 |
 * | 45° | 1.41 | 0.903 |
 * | 31° | 1.94 | **0.792** |
 * | 30° | 1.99 | 0.781 |
 * | 10° | 5.59 | 0.318 |
 * | 0° | 37.92 | ~0.000 |
 *
 * **Measured consequence**: the east wall of the default flat's `livingDining` renders at **1.445 of
 * a Cycles reference at 17:00** against 0.974 at 13:00, with the ceiling and floor at 1.05 — the sun
 * is ~21 % too strong whenever it is low, and 17:00 is simply the hour that presents a surface to it
 * (at 09:00 the sun is EAST, behind that west-facing face, so the same error adds 0.040 instead of
 * 0.222). Everything else was eliminated by measurement first: shadow frustum, `castShadow` on the
 * walls, `shadowMap.enabled`, the ceiling occluder, `grade()`, environment specular (zeroing
 * `envMapIntensity` on 931 materials moved the patch 0.0 counts) and the window grille.
 *
 * **Why this is not simply fixed here, and what it would cost.** 13:00 is VALIDATED against Cycles at
 * 0.974, so the high-sun end must not move; the correction has to come out of the low end. But
 * dropping the 30° key to 0.781 puts it BELOW the 10° key's 0.85, which inverts the curve — the sun
 * would brighten as it set. A consistent fix therefore has to rescale the whole `>= 0°` chain to the
 * beam column above, and that column says 0° should be ~0.000 where this table deliberately holds
 * **0.4** with a warm `sunColor` of `[1.0, 0.72, 0.42]`. That 0.4 is an artistic sunset, not an
 * oversight, so a physically pure curve would delete a look somebody chose. It needs the same
 * treatment `.223` and `.251` got — before/after tour, the three verified surfaces re-measured at
 * several hours — rather than a quiet edit here.
 */
const LIGHTING_KEYS: ReadonlyArray<LightingKey> = [
  {
    // NEW TOP KEY (`v0.31.7.257`). The table used to stop at 30°, so `bracket()` clamped every
    // altitude from 30° to 90° to one value and the beam was constant across a range where air
    // mass halves. Anchoring at 85° = 1.0 keeps the HIGH-sun end exactly where it was, which
    // matters because 13:00 (elevation 83.9°) is the hour validated against Cycles at 0.974 —
    // the correction has to come out of the low end, and it does.
    altDeg: 85,
    values: {
      sun: 1.0,
      ambient: 0.6,
      sunColor: [1.0, 0.96, 0.88],
      skyColor: [0.55, 0.66, 0.92],
      groundColor: [0.42, 0.38, 0.34],
    },
  },
  {
    // 45° and 30° now follow the Kasten-Young beam, normalised to 85°: 0.903 and 0.781. The
    // sunColor/ambient/sky keys are UNCHANGED — this corrects the beam's strength, not its warmth.
    altDeg: 45,
    values: {
      sun: 0.903,
      ambient: 0.6,
      sunColor: [1.0, 0.96, 0.88],
      skyColor: [0.55, 0.66, 0.92],
      groundColor: [0.42, 0.38, 0.34],
    },
  },
  {
    altDeg: 30,
    values: {
      sun: 0.781,
      ambient: 0.6,
      sunColor: [1.0, 0.96, 0.88],
      skyColor: [0.55, 0.66, 0.92],
      groundColor: [0.42, 0.38, 0.34],
    },
  },
  {
    altDeg: 10,
    values: {
      // 0.318 from the same beam column (air mass 5.59). Was 0.85, which sat ABOVE the corrected
      // 30° value and would have inverted the curve — the sun brightening as it set.
      sun: 0.318,
      ambient: 0.55,
      sunColor: [1.0, 0.92, 0.78],
      skyColor: [0.62, 0.62, 0.78],
      groundColor: [0.4, 0.34, 0.3],
    },
  },
  {
    altDeg: 0,
    values: {
      // The one DELIBERATE departure from physics in this chain. Air mass at the horizon is 37.9,
      // so the beam column says ~0.000 — but the warm `sunColor` below is a chosen sunset, and
      // deleting the beam that carries it would delete the look. 0.10 keeps a dim warm beam and
      // stays monotonic under the 10° value; it is a look call, flagged as one.
      sun: 0.1,
      ambient: 0.4,
      sunColor: [1.0, 0.72, 0.42],
      skyColor: [0.72, 0.56, 0.46],
      groundColor: [0.34, 0.28, 0.25],
    },
  },
  {
    altDeg: -6,
    values: {
      sun: 0.05,
      ambient: 0.18,
      sunColor: [0.45, 0.5, 0.65],
      skyColor: [0.3, 0.35, 0.52],
      groundColor: [0.18, 0.18, 0.23],
    },
  },
  {
    altDeg: -12,
    values: {
      sun: 0,
      ambient: 0.12,
      sunColor: [0.24, 0.29, 0.42],
      skyColor: [0.16, 0.2, 0.34],
      groundColor: [0.1, 0.11, 0.16],
    },
  },
]

const SKY_KEYS: ReadonlyArray<SkyKey> = [
  {
    altDeg: 30,
    values: { turbidity: 5, rayleigh: 1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  },
  {
    altDeg: 10,
    values: { turbidity: 6, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82 },
  },
  { altDeg: 0, values: { turbidity: 8, rayleigh: 3, mieCoefficient: 0.01, mieDirectionalG: 0.9 } },
  {
    altDeg: -6,
    values: { turbidity: 9, rayleigh: 1, mieCoefficient: 0.008, mieDirectionalG: 0.85 },
  },
  {
    altDeg: -12,
    values: { turbidity: 10, rayleigh: 0.1, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function interpLighting(a: LightingValues, b: LightingValues, t: number): LightingValues {
  return {
    sun: lerp(a.sun, b.sun, t),
    ambient: lerp(a.ambient, b.ambient, t),
    sunColor: lerp3(a.sunColor, b.sunColor, t),
    skyColor: lerp3(a.skyColor, b.skyColor, t),
    groundColor: lerp3(a.groundColor, b.groundColor, t),
  }
}

function interpSky(a: SkyValues, b: SkyValues, t: number): SkyValues {
  return {
    turbidity: lerp(a.turbidity, b.turbidity, t),
    rayleigh: lerp(a.rayleigh, b.rayleigh, t),
    mieCoefficient: lerp(a.mieCoefficient, b.mieCoefficient, t),
    mieDirectionalG: lerp(a.mieDirectionalG, b.mieDirectionalG, t),
  }
}

/** Find adjacent keyframes for a given altitude (radians) and return
 *  (upper, lower, t) where t∈[0,1] interpolates from `lower` toward `upper`. */
function bracket<T extends { altDeg: number }>(
  keys: ReadonlyArray<T>,
  altRad: number,
): { upper: T; lower: T; t: number } {
  const altDeg = altRad / DEG
  if (altDeg >= keys[0].altDeg) return { upper: keys[0], lower: keys[0], t: 0 }
  if (altDeg <= keys[keys.length - 1].altDeg) {
    const k = keys[keys.length - 1]
    return { upper: k, lower: k, t: 0 }
  }
  for (let i = 0; i < keys.length - 1; i++) {
    const upper = keys[i]
    const lower = keys[i + 1]
    if (altDeg <= upper.altDeg && altDeg >= lower.altDeg) {
      const span = upper.altDeg - lower.altDeg
      const t = span === 0 ? 0 : (altDeg - lower.altDeg) / span
      return { upper, lower, t }
    }
  }
  return { upper: keys[keys.length - 1], lower: keys[keys.length - 1], t: 0 }
}

export function lightingFromAltitude(altRad: number): LightingValues {
  const { upper, lower, t } = bracket(LIGHTING_KEYS, altRad)
  return interpLighting(lower.values, upper.values, t)
}

export function skyFromAltitude(altRad: number): SkyValues {
  const { upper, lower, t } = bracket(SKY_KEYS, altRad)
  return interpSky(lower.values, upper.values, t)
}

/**
 * Daylight strength, 0 (night) … 1 (sun up), from the sun's altitude.
 *
 * The window glass tells a day/night story — clear and sky-lit by day, dark and
 * reflective after dark (`GLASS_DAY`/`GLASS_NIGHT`, `windowTransmission`,
 * `glassSkyCatchIntensity`, all of which take a `daylight` argument). Until
 * v0.31.5.127 both window renderers fed that argument `1 - getFixtureGlow()`,
 * and `getFixtureGlow` is **exactly the lamp switch** (`FurnitureLights.tsx`:
 * `const level = lightsMode === 'on' ? 1 : 0`) with no time term at all. Since
 * `ensureDaylightFirstPaint` turns the lamps on at EVERY hour on a fresh seed,
 * every new visitor met night-coloured glass at midday — measured at 13:00, the
 * panes sat at `#20272f` / opacity 0.73 / sky-catch 0.00 with the lamps on, and
 * flipped to `#bcd4e6` / 0.28 / 0.40 with the same clock and the lamps off.
 *
 * The ramp is the one `skyGradient.ts:skyRadiance` already uses for its own
 * night fade — full daylight above the horizon, fully dark by −8° (civil dusk),
 * linear between — so the glass and the sky reach night together instead of
 * disagreeing. Pure; `altRad` is radians, negative below the horizon.
 */
export function daylightFromAltitude(altRad: number): number {
  const altDeg = (altRad * 180) / Math.PI
  return Math.max(0, Math.min(1, (altDeg + 8) / 8))
}

/**
 * Chroma of the DAYTIME sky, luminance-preserving, for the baked-irradiance injection (`(z4)`).
 *
 * The injected indirect term was achromatic — a `float` gain times the map's `.r` — so every
 * shadowed surface rendered at its own albedo hue and shadow fill in this renderer had no colour
 * at all. Real shadow fill is sky-lit and therefore blue: an exposure-matched Cycles reference put
 * the `livingDining` east wall at **R−B −14.9** against the app's **+12.4**.
 *
 * **Constant, not interpolated per hour, and that is deliberate.** The tint is folded into the
 * `visGain` uniform and appears in `customProgramCacheKey`, so a value that tracked the sun would
 * recompile every baked material on every hour change — `v0.31.7.15` measured a **216 ms** frame
 * for exactly that. It costs nothing here: `LIGHTING_KEYS` carries the SAME `skyColor`
 * `[0.55, 0.66, 0.92]` at 30°, 45° and 85°, so a daylight constant is not an approximation across
 * the hours this matters for. Only the ≤10° keys differ, and there the direct beam has collapsed
 * to 0.318 and below anyway.
 *
 * Normalised by Rec. 709 luminance so the tint carries **chroma only**. Adding colour must not
 * smuggle in a brightness change, or it would silently re-open the `IRRADIANCE_GAIN` calibration
 * that nine measurements went into.
 */
export function daytimeSkyTint(): [number, number, number] {
  const sky = LIGHTING_KEYS[0]?.values.skyColor ?? [1, 1, 1]
  const luma = 0.2126 * sky[0] + 0.7152 * sky[1] + 0.0722 * sky[2]
  if (luma <= 0) return [1, 1, 1]
  return [sky[0] / luma, sky[1] / luma, sky[2] / luma]
}

/**
 * DAYLIGHT-HOUR-CURVE (W2) — how much sky there actually is at this sun altitude, normalised so
 * the CALIBRATED midday render is untouched.
 *
 * **The defect.** {@link daylightFromAltitude} is a NIGHT ramp: it saturates at 1 for every
 * altitude above 0°, so it calls 08:00 (sun 15.2°), 13:00 (89.6°) and 18:30 (7.3°) all "full
 * daylight". It drives `visibilityLightmap.ts:setVisDayLevel`, which scales the baked bounced
 * daylight on the flat's **184 mapped shell surfaces** — measured live on Metal, `visDay` read
 * exactly `1` at all three of those hours. Those surfaces are most of what a walker sees, so the
 * daytime band barely moves: the review pass measured 08:00 against 18:30 at mean abs **8.0/255**
 * over the central 390×600, against a same-build session variance of 4.7.
 *
 * **The curve.** Kasten & Czeplak (1980) clear-sky global horizontal irradiance
 * `G = 910·sin(h) − 30` W/m², of which the diffuse fraction is near-constant for a clear sky — so
 * the ratio below is the DIFFUSE ratio too, which is the quantity the bake holds (the shipped set
 * is `--pass irradiance` with `with_sun_disc: false`, i.e. the sky dome and its bounces, no beam).
 * Normalised at {@link SKY_DIFFUSE_SATURATION_DEG}, above which it returns **exactly 1.0** — the
 * literal, not a rounded one — so every hour at or above that altitude is byte-identical to the
 * pre-curve render. 13:00 in Singapore is 89.6°, which is the hour validated against Cycles at
 * 0.974 and the hour every calibrated frame in `docs/audit/` was shot at.
 *
 * | hour (1.35°N, 19 Sep) | altitude | ratio |
 * | --- | --- | --- |
 * | 13:00 | 89.6° | **1.000** |
 * | 12:00 | 75.2° | **1.000** |
 * | 11:00 | 60.2° | 0.895 |
 * | 10:00 | 45.2° | 0.725 |
 * | 09:00 | 30.2° | 0.504 |
 * | 08:00 | 15.2° | 0.246 |
 * | 18:30 | 7.3° | 0.101 |
 *
 * Pure; `altRad` is radians.
 */
export const SKY_DIFFUSE_SATURATION_DEG = 75

export function skyDiffuseRatio(altRad: number): number {
  if (!Number.isFinite(altRad)) return 0
  const peak = 910 * Math.sin((SKY_DIFFUSE_SATURATION_DEG * Math.PI) / 180) - 30
  const here = 910 * Math.sin(altRad) - 30
  if (here >= peak) return 1
  return Math.max(0, Math.min(1, here / peak))
}

/**
 * How much of {@link skyDiffuseRatio}'s swing the BAKED daylight term actually takes.
 *
 * Not 1, and that is a look call stated as one. The physical ratio puts 18:30 at 0.101 of noon,
 * which is true of the sky and is not true of the picture: the app's `grade()` exposure only
 * spans 1.38 (13:00) → 1.07 (18:30), a third of a stop, where a real camera would open up several
 * — so shipping the raw ratio would render a late-afternoon room at a tenth of midday with almost
 * none of that recovered by exposure, and the late-afternoon frames are ones the review pass
 * called the best-looking in the matrix. 0.6 gives a ~2× morning/evening dip, which is visible at
 * a glance (the review's complaint was 8 counts against a 4.7-count session variance) without
 * rewriting a look nobody asked to change. Raise it with a before/after tour, not quietly.
 */
export const BAKED_DAY_VARIATION = 0.6

/** The level the baked bounced daylight is scaled by, 0 (night) … 1 (calibrated midday).
 *  Exactly 1 wherever {@link skyDiffuseRatio} is 1 — `1 + (1 − 1) · v === 1` in IEEE 754 — so the
 *  13:00 render is untouched to the bit. Multiplied by the night ramp so it still reaches 0 after
 *  dark, which is what `bakedGiDayLevel` (LIVING-SLAB) exists to do. Pure. */
export function bakedDayLevel(altRad: number, vary: number = BAKED_DAY_VARIATION): number {
  const night = daylightFromAltitude(altRad)
  if (night <= 0) return 0
  const v = Number.isFinite(vary) ? Math.max(0, Math.min(1, vary)) : 0
  return night * (1 + (skyDiffuseRatio(altRad) - 1) * v)
}

/**
 * LIGHTS-DAYLIGHT-ADDITIVE (W1) — the weight the FIXTURE contribution takes at this sun altitude.
 *
 * **The defect.** The lamp level is `lightsMode === 'on' ? 1 : 0` with no time term anywhere
 * (`fixtureGlow.ts` says so in as many words), and it was calibrated at NIGHT. Measured on Metal:
 * switching the lights on adds 19 point lights and lifts every mapped material's `lampBounce`
 * uniform 0 → 0.462, in the same irradiance units as a healthy daylit wall's baked term (0.5–1.1).
 * So at 13:00 a lamp is worth about as much as the whole midday sky, and the review measured five
 * rooms spanning a **9× daylight range** all landing at floor luma 147–176 with the lamps on.
 * The switch was already ADDITIVE — every one of those rooms got brighter — but the addend
 * swamped the daylight gradient rather than sitting on top of it.
 *
 * **Why a weight and not an intensity change.** The lamp flux is what sets the 21:00 frames the
 * night look was calibrated against (kitchen ceiling 200, living 200), so it cannot move. What is
 * wrong is the RATIO the renderer shows at noon, and the honest reason it is wrong is the
 * exposure: the app's `grade()` spans 0.897 (21:00) → 1.38 (13:00), so the same lamp radiance is
 * rendered 1.54× brighter at noon than at night, on top of a midday interior that this renderer
 * puts at 64–150/255. This weight restores the illuminance ratio a real flat has — a ~1200 lm
 * ceiling luminaire against a north-facing Singapore room's several-thousand-lumen midday
 * daylight is a warm cast, not the light source — and it is expressed against the SKY curve, not
 * the night ramp, so 18:30 (ratio 0.101) keeps its lamps at 0.92 where they belong.
 *
 * Exactly **1.0** whenever `skyDiffuseRatio` is 0, i.e. at every hour below the horizon:
 * `F + (1 − F) · 1 === 1` in IEEE 754, so the calibrated night frames are untouched to the bit.
 */
export const LAMP_DAY_FLOOR = 0.25

export function lampDaylightWeight(altRad: number, floor: number = LAMP_DAY_FLOOR): number {
  const f = Number.isFinite(floor) ? Math.max(0, Math.min(1, floor)) : LAMP_DAY_FLOOR
  return f + (1 - f) * (1 - skyDiffuseRatio(altRad))
}
