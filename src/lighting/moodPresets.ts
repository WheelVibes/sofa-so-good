/**
 * moodPresets.ts — Lighting mood presets (UX round-3 #3, Coohom parity).
 *
 * A one-tap preset row (Reading / Movie night / Entertaining / Romantic, plus
 * "Normal" reset) that adjusts placed light fixtures' brightness and colour
 * temperature scene-wide. Pure + render-agnostic (no three.js/R3F/store import,
 * matching the `src/lighting/` area rule) so it's cheaply unit-testable.
 *
 * ## Composition (WALK-LIGHT-INTERACT invariant, must never regress)
 * A mood preset composes ON TOP of the existing `lightsMode` ('auto'|'on'|'off')
 * brightness multiplier — it never re-derives whether an item is lit at all.
 * Concretely: `finalIntensity = baseIntensity * lightsModeLevel *
 * moodIntensityMultiplier(mood, defId)`. It is applied by the renderer
 * (`scene/lighting/FurnitureLights.tsx`) only to items that already passed the
 * per-item `isItemEmitter`/`resolveEmitterSpec` gate — a `lightOn === 'no'`
 * item is filtered out upstream and this module never sees it, so a mood can
 * NEVER turn a switched-off light back on.
 *
 * ## Per-fixture-kind adjustment (kept to one simple pass)
 * Ceiling-mounted fixtures (`ceiling-light`/`ceiling-fan`/`cove-light`) get
 * their own, usually lower, multiplier — e.g. Movie night dims the overhead
 * wash harder than a table/floor lamp, matching how a real living room dims
 * for a film. Every other fixture kind (table lamp, floor lamp, wall sconce,
 * vanity, aquarium, and any non-registered `lightOn` override) uses the
 * preset's general multiplier.
 */

import type { FurnitureType } from '../furniture/types'

/** Selectable lighting mood. `'none'` is the "Normal" reset (no adjustment). */
export type LightMood = 'none' | 'reading' | 'movie' | 'entertaining' | 'romantic'

/** Ordered for the preset chip row (Normal first, then the four moods). */
export const LIGHT_MOODS: readonly LightMood[] = [
  'none',
  'reading',
  'movie',
  'entertaining',
  'romantic',
]

export interface MoodPreset {
  id: LightMood
  label: string
  /** Brightness multiplier for accent fixtures (lamps, sconces, etc.) on top
   *  of the existing `lightsMode` level. `1` = unchanged. */
  intensity: number
  /** Brightness multiplier for ceiling-mounted fixtures — usually lower than
   *  `intensity` so an overhead wash dims further for a moodier scene. */
  ceilingIntensity: number
  /** Warm/cool tint multiplied component-wise into each bulb's colour
   *  ([r,g,b] each 0..1, same convention as `windowLightModifiers.ts:
   *  glassTintRgb`). `[1,1,1]` = neutral, no tint shift. */
  tint: readonly [number, number, number]
}

/** Fixture kinds mounted at/near the ceiling — the overhead "room wash" as
 *  opposed to accent/task lighting. Kept to the registered `LIGHT_EMITTERS`
 *  kinds in `furniture/lightEmitters.ts` that actually read as overhead light. */
const CEILING_FIXTURE_KINDS: ReadonlySet<string> = new Set<FurnitureType>([
  'ceiling-light',
  'ceiling-fan',
  'cove-light',
])

/** Whether a fixture kind (a `FurnitureType`, or any other `defId` string for
 *  a non-registered `lightOn` override) reads as a ceiling/overhead fixture. */
export function isCeilingFixtureKind(defId: string): boolean {
  return CEILING_FIXTURE_KINDS.has(defId)
}

export const MOOD_PRESETS: Record<LightMood, MoodPreset> = {
  none: {
    id: 'none',
    label: 'Normal',
    intensity: 1,
    ceilingIntensity: 1,
    tint: [1, 1, 1],
  },
  reading: {
    // Bright, crisp task light — a touch cooler-neutral than the fixture's
    // own warm default so print reads clearly; overhead untouched (reading
    // is usually a lamp, not the room wash).
    id: 'reading',
    label: 'Reading',
    intensity: 1.25,
    ceilingIntensity: 1,
    tint: [0.97, 0.99, 1],
  },
  movie: {
    // Dim + warm + cinematic. Ceiling dims hardest (the overhead wash is the
    // first thing you kill for a film), accent lamps stay a little brighter
    // as low ambient fill so the room doesn't go pitch black.
    id: 'movie',
    label: 'Movie night',
    intensity: 0.35,
    ceilingIntensity: 0.12,
    tint: [1, 0.8, 0.58],
  },
  entertaining: {
    // Bright and warm — a sociable, welcoming wash for guests, slightly
    // brighter than normal across the board.
    id: 'entertaining',
    label: 'Entertaining',
    intensity: 1.15,
    ceilingIntensity: 1.1,
    tint: [1, 0.93, 0.82],
  },
  romantic: {
    // Low and warm, ceiling nearly off — candle-like accent-only glow.
    id: 'romantic',
    label: 'Romantic',
    intensity: 0.5,
    ceilingIntensity: 0.15,
    tint: [1, 0.72, 0.55],
  },
}

/** The mood's brightness multiplier for a given fixture kind, composed ON TOP
 *  of the existing `lightsMode` level by the caller (never in place of it). */
export function moodIntensityMultiplier(mood: LightMood, defId: string): number {
  const preset = MOOD_PRESETS[mood]
  return isCeilingFixtureKind(defId) ? preset.ceilingIntensity : preset.intensity
}

/** Convert a 6-digit hex colour string to [r,g,b] in 0..1 range. Falls back to
 *  neutral white for a malformed hex (mirrors `windowLightModifiers.ts:
 *  hexToRgb01`, kept as a local, dependency-free copy so this module stays
 *  import-free within `src/lighting/`). */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length !== 6) return [1, 1, 1]
  const r = Number.parseInt(h.slice(0, 2), 16) / 255
  const g = Number.parseInt(h.slice(2, 4), 16) / 255
  const b = Number.parseInt(h.slice(4, 6), 16) / 255
  return [r, g, b]
}

function rgb01ToHex([r, g, b]: readonly [number, number, number]): string {
  const toHex = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Applies the mood's warm/cool tint to a bulb colour, as a component-wise
 *  multiply (same convention as the window glass tint) — `mood: 'none'`
 *  returns the input colour unchanged. */
export function applyMoodTint(colorHex: string, mood: LightMood): string {
  const { tint } = MOOD_PRESETS[mood]
  if (tint[0] === 1 && tint[1] === 1 && tint[2] === 1) return colorHex
  const [r, g, b] = hexToRgb01(colorHex)
  return rgb01ToHex([r * tint[0], g * tint[1], b * tint[2]])
}

export interface MoodLightAdjustment {
  /** Bulb colour after the mood's tint (hex). */
  color: string
  /** Multiplier to apply on top of the existing `lightsMode` level scalar. */
  intensityMultiplier: number
}

/** Composes a fixture's tinted colour + brightness multiplier for the active
 *  mood in one call — the renderer's single entry point into this module. */
export function applyMoodPreset(
  mood: LightMood,
  defId: string,
  baseColorHex: string,
): MoodLightAdjustment {
  return {
    color: applyMoodTint(baseColorHex, mood),
    intensityMultiplier: moodIntensityMultiplier(mood, defId),
  }
}
