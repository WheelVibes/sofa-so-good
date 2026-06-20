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

function normalize(v: Vec3): Vec3 {
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
 * Analytic Preetham sky radiance for a `view` direction (need not be normalised),
 * in **relative linear RGB** (≥ 0). The result is scaled so a clear midday zenith
 * lands near ~0.5–1.0, suitable for an LDR backdrop.
 *
 * Views below the horizon (`view.y < 0`) return a ground tint that darkens toward
 * the nadir — the painter uses this for the lower hemisphere.
 */
export function skyRadiance(view: Vec3, params: SkyParams): Vec3 {
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
    return [groundAlbedo[0] * k * lvl, groundAlbedo[1] * k * lvl, groundAlbedo[2] * k * lvl]
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
  const rgb = xyYtoLinearRGB(x, y, Math.max(Y, 0) / 22)

  return [rgb[0] * night, rgb[1] * night, rgb[2] * night]
}

/** Linear → sRGB (gamma) for an 8-bit framebuffer byte. */
function encodeByte(linear: number): number {
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
  let i = 0
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const dir = equirectDir(col, row, w, h)
      const rgb = skyRadiance(dir, params)
      buf[i] = encodeByte(rgb[0])
      buf[i + 1] = encodeByte(rgb[1])
      buf[i + 2] = encodeByte(rgb[2])
      buf[i + 3] = 255
      i += 4
    }
  }
}
