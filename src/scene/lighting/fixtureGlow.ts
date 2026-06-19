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
 * threshold (`BLOOM_LUMINANCE_THRESHOLD` = 1.35, mirrors `look.BLOOM`)** with
 * margin, so a lit fixture both blooms on High/Max (like the cove strip +
 * fireplace already do) AND reads clearly self-lit on the flat Performance tier,
 * where emissive shows but bloom doesn't. The threshold was raised (from 1.05) to
 * kill the "milky daytime" veil where broad sunlit walls used to bloom; the peaks
 * below were lifted in lock-step so genuine emitters still clear it. Base
 * (daylight) stays low so fixtures go dark in the sun.
 */
const NIGHT_EMISSIVE: Record<FixtureRole, { base: number; gain: number }> = {
  shade: { base: 0.08, gain: 1.52 }, // diffusing lamp / ceiling / sconce shade → peak ~1.60
  bulb: { base: 0.1, gain: 1.95 }, // bare bulb → peak ~2.05 (glows hot)
  strip: { base: 0.06, gain: 1.74 }, // LED cove strip → peak ~1.80
}

/** The Bloom luminance threshold this ramp is tuned against (mirrors
 *  `look.BLOOM.luminanceThreshold`). Re-declared here — and asserted equal in the
 *  test — to keep the emitter peaks and the bloom cutover from drifting apart
 *  without a three.js import in this pure module. */
export const BLOOM_LUMINANCE_THRESHOLD = 1.35

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
