/**
 * Shared 0..1 **lamp switch** factor, read by light-fixture primitives so their
 * emissive shades glow when the lights are on and go dark when they are off. A
 * plain module singleton (not store state) keeps it out of React re-renders —
 * it's polled in useFrame.
 *
 * **It is EXACTLY `lightsMode === 'on' ? 1 : 0`** (`FurnitureLights.tsx`), written
 * on CHANGE in a `useEffect`, not every frame. Two earlier claims in this header
 * were wrong and caused a real defect (v0.31.5.127): it is not "≈ scene darkness",
 * and it does not track the clock at all.
 *
 * **Do not use it as a day/night factor.** Both window renderers did — feeding
 * `1 - getFixtureGlow()` to `windowTransmission(daylight)`,
 * `glassSkyCatchIntensity(daylight)` and the `GLASS_DAY`/`GLASS_NIGHT` lerp — and
 * since `ensureDaylightFirstPaint` turns the lamps on at EVERY hour on a fresh
 * seed, every new visitor met night-coloured glass at midday. Use
 * `altitudeCurve.ts:daylightFromAltitude(sun.altitude)` for anything that means
 * "is it daytime".
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
