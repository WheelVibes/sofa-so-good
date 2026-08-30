/**
 * Pure clamp helpers + ranges for the render/snapshot camera's **lens** (focal
 * length) and **depth of field** (f-stop + focus distance). Kept dependency-free
 * (mirrors `walkCameraSettings.ts`) so the store slice, the HQ path tracer, the
 * raster DoF pass, persistence and tests all share one source of truth for the
 * sane ranges, defaults and conversions.
 *
 * Focal length is expressed in 35 mm-equivalent millimetres against a full-frame
 * sensor (default 24 mm sensor *height*). Three's `PerspectiveCamera.fov` is the
 * **vertical** field of view in degrees, so the mm↔fov conversions below use the
 * sensor height — `mmToFov(mm) = 2*atan((sensorH/2)/mm) * 180/π`.
 */

/** Full-frame sensor height (mm) — the basis for the vertical-FOV conversion. */
export const SENSOR_HEIGHT_MM = 24

/** Focal-length range (mm). Wide (14) → short tele (200). */
export const FOCAL_MIN_MM = 14
export const FOCAL_MAX_MM = 200
/** Default lens — a natural ~50 mm "normal" perspective. */
export const FOCAL_DEFAULT_MM = 50

/** Named focal presets for the lens dropdown (35 mm-equivalent). */
export const FOCAL_PRESETS: { mm: number; label: string }[] = [
  { mm: 24, label: '24 mm · wide' },
  { mm: 35, label: '35 mm · reportage' },
  { mm: 50, label: '50 mm · normal' },
  { mm: 85, label: '85 mm · portrait' },
]

/** Aperture f-stop range. Lower = shallower depth of field (more blur). */
export const FSTOP_MIN = 1
export const FSTOP_MAX = 22
/** Default aperture (off → pinhole, no DoF). */
export const FSTOP_DEFAULT = 0

/** Photographic aperture stops for the f-stop dropdown; 0 = off (pinhole). */
export const FSTOP_PRESETS: { v: number; label: string }[] = [
  { v: 0, label: 'DoF off' },
  { v: 8, label: 'f/8 · subtle' },
  { v: 4, label: 'f/4 · balanced' },
  { v: 2.8, label: 'f/2.8 · portrait' },
  { v: 1.4, label: 'f/1.4 · dramatic' },
]

/** Focus-distance range (metres) — close macro up to far room depth. */
export const FOCUS_MIN_M = 0.2
export const FOCUS_MAX_M = 50
/** Default manual focus distance (metres) when auto-focus is off. */
export const FOCUS_DEFAULT_M = 3

const DEG = 180 / Math.PI

/** Clamp a focal length (mm) to the sane lens range. Non-finite → the default. */
export function clampFocalMm(mm: number): number {
  if (!Number.isFinite(mm)) return FOCAL_DEFAULT_MM
  return Math.max(FOCAL_MIN_MM, Math.min(FOCAL_MAX_MM, mm))
}

/** Clamp an aperture f-stop. 0 (or negative) → 0 (DoF off); else the sane range. */
export function clampFStop(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.max(FSTOP_MIN, Math.min(FSTOP_MAX, v))
}

/** Clamp a focus distance (metres) to the sane range. Non-finite → default. */
export function clampFocusDistance(m: number): number {
  if (!Number.isFinite(m)) return FOCUS_DEFAULT_M
  return Math.max(FOCUS_MIN_M, Math.min(FOCUS_MAX_M, m))
}

/**
 * Convert a focal length (mm) to a three `PerspectiveCamera.fov` — the
 * **vertical** field of view in degrees — for the given sensor height (mm).
 * `fov = 2 * atan((sensorH / 2) / mm) * 180/π`.
 */
export function mmToFov(mm: number, sensorH = SENSOR_HEIGHT_MM): number {
  const f = clampFocalMm(mm)
  return 2 * Math.atan(sensorH / 2 / f) * DEG
}

/** Inverse of {@link mmToFov}: a vertical FOV (degrees) → focal length (mm),
 *  clamped to the sane lens range. */
export function fovToMm(fovDeg: number, sensorH = SENSOR_HEIGHT_MM): number {
  if (!Number.isFinite(fovDeg) || fovDeg <= 0) return FOCAL_DEFAULT_MM
  const half = fovDeg / DEG / 2
  const t = Math.tan(half)
  if (t <= 0) return FOCAL_MAX_MM
  return clampFocalMm(sensorH / 2 / t)
}

/**
 * The vertical FOV (degrees) an HQ render should use, given the user's chosen
 * lens and the live viewport camera's own FOV.
 *
 * The lens wins whenever one is chosen; otherwise the render inherits the live
 * framing. Kept pure and separate because the choice is **independent of the
 * aperture** — a 24 mm still is a 24 mm still whether or not depth of field is
 * on, and treating the lens as a DoF sub-setting silently ignored the dropdown
 * at the default "DoF off" aperture.
 */
export function hqRenderFov(focalLengthMm: number | undefined, liveFovDeg: number): number {
  const live = Number.isFinite(liveFovDeg) && liveFovDeg > 0 ? liveFovDeg : 50
  if (!Number.isFinite(focalLengthMm as number) || (focalLengthMm as number) <= 0) return live
  return mmToFov(focalLengthMm as number)
}

/**
 * Map an aperture f-stop to cheap raster-DoF parameters for
 * `@react-three/postprocessing`'s `<DepthOfField>` (world-space form).
 *
 *  - `bokehScale` (blur strength) grows as the aperture opens (lower f-stop):
 *    f/1.4 → strong, f/8+ → subtle. Kept modest so the half-res pass stays cheap
 *    and artifact-light.
 *  - `worldFocusRange` (metres in sharp focus around the focus plane) widens with
 *    a higher f-stop (deeper depth of field) and narrows wide open.
 *
 * Pure so the value is unit-testable and shared. Returns zeroed params when the
 * aperture is off (f-stop ≤ 0).
 */
export function rasterDofParams(fStop: number): { bokehScale: number; worldFocusRange: number } {
  const f = clampFStop(fStop)
  if (f <= 0) return { bokehScale: 0, worldFocusRange: 0 }
  // f/1.4 → ~6 bokeh, f/22 → ~1; clamp to a modest ceiling for the raster pass.
  const bokehScale = Math.max(1, Math.min(6, 8 / f))
  // Shallow wide open (~0.5 m), deeper stopped down (~4 m).
  const worldFocusRange = Math.max(0.5, Math.min(4, f / 4))
  return { bokehScale, worldFocusRange }
}
