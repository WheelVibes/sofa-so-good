/**
 * Shared 0..1 "lights are on" factor (≈ scene darkness), written each frame by
 * FurnitureLights and read by light-fixture primitives so their emissive
 * shades glow at night and go dark in daylight. A plain module singleton (not
 * store state) keeps it out of React re-renders — it's polled in useFrame.
 */
let glow = 0

export function setFixtureGlow(v: number): void {
  glow = v
}

export function getFixtureGlow(): number {
  return glow
}

/** Light-fixture emissive roles (how the glowing part reads). */
export type FixtureRole = 'shade' | 'bulb' | 'strip'

/**
 * Per-role night-emissive ramp: `emissiveIntensity = base + glow * gain`. Peak
 * values (glow = 1, full darkness) are tuned **above the Bloom luminance
 * threshold (~1.05, see `EffectsImpl`)** so a lit fixture both blooms on High/Max
 * (like the cove strip + fireplace already do) AND reads clearly self-lit on the
 * flat Performance tier, where emissive shows but bloom doesn't. Base (daylight)
 * stays low so fixtures go dark in the sun.
 */
const NIGHT_EMISSIVE: Record<FixtureRole, { base: number; gain: number }> = {
  shade: { base: 0.08, gain: 1.25 }, // diffusing lamp / ceiling / sconce shade → peak ~1.33
  bulb: { base: 0.1, gain: 1.75 }, // bare bulb → peak ~1.85 (glows hot)
  strip: { base: 0.06, gain: 1.6 }, // LED cove strip → peak ~1.66
}

/** Emissive intensity for a light-fixture part at the current (or given) glow
 *  level. Centralised so every fixture ramps consistently and the bloom-clearing
 *  peaks live in one place. Pure (testable) when `glow` is passed. */
export function fixtureEmissiveIntensity(
  role: FixtureRole,
  glow: number = getFixtureGlow(),
): number {
  const { base, gain } = NIGHT_EMISSIVE[role]
  return base + glow * gain
}
