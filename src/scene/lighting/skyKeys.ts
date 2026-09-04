/**
 * Pick and blend the baked Cycles sky keys for a sun direction.
 *
 * **What this is for.** Item `(l)` / `(z)`4: the app's window reads as a panel rather than an
 * opening, and the fix needs the **physical** sky — `backgroundIntensity ≈ 4` alone was measured to
 * raise a 4x-oversaturated gradient (`v0.31.7.77`). The sun moves, so one baked equirect cannot
 * serve, and `v0.31.7.148`–`.150` measured the alternative: keys at **30° of altitude** hold the
 * Cycles sky to **≤1.4 %** whole-frame and **≤0.67 %** in the brightest decile, the error is
 * **independent of resolution and sample count**, and a 4-key set at 512×256 is **500 kB** and bakes
 * in **8 seconds**.
 *
 * **Altitude needs keys; azimuth does not.** A multiple-scattering sky is azimuthally symmetric
 * about the sun, so moving the sun in azimuth is a **rotation of the equirect** — one `u` offset, no
 * extra asset. That is why the set is small.
 *
 * Pure and headless-testable on purpose: every convention error this arc has shipped (`v0.31.7.101`
 * mirrored masks, `.136` a Blender-frame normal, `.140` a slot off-by-one) was in exactly this kind
 * of index arithmetic, and none of them was visible in a screenshot.
 */

/** Baked key altitudes, in degrees. Must match the files in `public/assets/sky-keys/`. */
export const SKY_KEY_ALTITUDES = [0, 30, 60, 88] as const

/** Asset path for a key. */
export function skyKeyUrl(altDeg: number, base = '/assets/sky-keys/'): string {
  return `${base}alt${altDeg}.png`
}

export interface SkyKeyBlend {
  /** Lower-altitude key to sample. */
  loAlt: number
  /** Higher-altitude key to sample. Equal to `loAlt` when the sun is at or past an end. */
  hiAlt: number
  /** Weight of `hiAlt` in `[0, 1]`; `1 - t` is `loAlt`'s. */
  t: number
  /**
   * Horizontal texture offset in turns `[0, 1)` that rotates the key to the sun's azimuth.
   *
   * The keys are baked with the sun at azimuth 0 — travel `(0, −cos, sin)`, i.e. due **−Z**, which
   * is the direction `equirectDir` maps to `u = 0.5`. So the offset is the sun's azimuth measured in
   * the same frame, and it wraps.
   */
  uOffset: number
}

/**
 * Blend parameters for a sun TRAVEL vector in three's frame (`+X` east, `+Y` up, `+Z` south).
 *
 * `travel` points from the sun toward the scene, which is the app's own convention — the same vector
 * `render_equirect.py --sun-dir` takes, so a key and a live sun cannot disagree about which way is
 * up.
 */
export function skyKeyBlend(travel: readonly [number, number, number]): SkyKeyBlend {
  const [tx, ty, tz] = travel
  const len = Math.hypot(tx, ty, tz) || 1
  // The sun DIRECTION is the negation of its travel: travel points at the scene.
  const sy = -ty / len
  const altDeg = (Math.asin(Math.max(-1, Math.min(1, sy))) * 180) / Math.PI

  const keys = SKY_KEY_ALTITUDES
  const first = keys[0] as number
  const last = keys[keys.length - 1] as number
  let loAlt = first
  let hiAlt = first
  let t = 0
  if (altDeg <= first) {
    // Below the lowest key: clamp rather than extrapolate. Twilight is the analytic
    // continuation's job (`v0.31.7.116`), not this set's — extrapolating a daylight key into
    // negative altitudes would fight it.
    loAlt = first
    hiAlt = first
    t = 0
  } else if (altDeg >= last) {
    loAlt = last
    hiAlt = last
    t = 0
  } else {
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = keys[i] as number
      const b = keys[i + 1] as number
      if (altDeg >= a && altDeg <= b) {
        loAlt = a
        hiAlt = b
        t = (altDeg - a) / (b - a)
        break
      }
    }
  }

  // Azimuth of the sun direction, matching `skyGradient.equirectDir`'s mapping: it builds a
  // direction as `[sin(phi)·sinθ, cos θ, −cos(phi)·sinθ]` with `phi = u·2π − π`, so
  // `phi = atan2(x, −z)` and `u = (phi + π) / 2π`. The keys are baked at `u = 0.5`.
  const sx = -tx / len
  const sz = -tz / len
  const u = (Math.atan2(sx, -sz) / (2 * Math.PI) + 0.5) % 1
  const uOffset = (((u - 0.5) % 1) + 1) % 1

  return { loAlt, hiAlt, t, uOffset }
}
