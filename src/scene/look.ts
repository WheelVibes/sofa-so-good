/**
 * Single source of truth for the graded "look". Pure functions only — no
 * three.js, no React — so the curves are unit-testable. Consumers (Lighting,
 * EffectsImpl) read these to drive exposure, white balance, shadow softness
 * and ambient occlusion. `altitude` is the sun altitude in radians as
 * returned by SunCalc (negative below the horizon, ~1.57 at zenith).
 */

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

/** Soft-shadow tuning for the sun directional light (PCFSoftShadowMap). */
export const SOFT_SHADOW = {
  radius: 4,
  normalBias: 0.04,
  // Small negative depth bias counteracts self-shadowing/acne on PCFSoftShadowMap.
  bias: -0.0002,
} as const

/** Screen-space AO tuning (N8AO) — deeper than the old defaults so corners
 *  and recesses ground like the reference renders. */
export const AO = {
  aoRadius: 0.7,
  distanceFalloff: 1.2,
  intensity: 3.0,
} as const
