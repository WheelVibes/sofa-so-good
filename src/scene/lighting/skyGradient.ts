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

export type Vec3 = readonly [number, number, number]

export interface SkyParams {
  /** Unit sun direction in scene space (+X east, +Y up, +Z south). */
  sunDir: Vec3
  /** Atmospheric turbidity (haze). ~2 = very clear, ~10 = very hazy. */
  turbidity: number
  /** Ground albedo tint for the lower hemisphere (linear RGB 0..1). */
  groundAlbedo?: Vec3
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
/** Degrees of sun altitude per e-fold of twilight decay (Cycles: ~10x per 2°). */
const TWILIGHT_YZ_SCALE_DEG = 0.87

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
    const t = smoothstep(clamp(-v[1] / GROUND_HAZE_SPAN, 0, 1))
    return [
      haze[0] + (ground[0] - haze[0]) * t,
      haze[1] + (ground[1] - haze[1]) * t,
      haze[2] + (ground[2] - haze[2]) * t,
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

  return [rgb[0] * night, rgb[1] * night, rgb[2] * night]
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
