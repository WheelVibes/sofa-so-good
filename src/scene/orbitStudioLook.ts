/**
 * ORBIT-STUDIO-LOOK — the soft overhead studio key the orbit dollhouse is lit by,
 * and the two compensations that keep the rest of the frame where it was.
 *
 * **The gap this closes is SHADOW DEPTH, not brightness.** Measured at the
 * canonical orbit pose (13:00, `realistic`, camera (18,12,16) → target
 * (6.3,0.8,4.5)) over the flat's own region against an architectural-visualisation
 * reference photograph, Rec.709 luma on sRGB bytes:
 *
 * | | p05 | p25 | p50 | p75 | p95 |
 * | --- | --- | --- | --- | --- | --- |
 * | reference | 56 | 114 | 156 | 193 | 218 |
 * | app before | 127 | 162 | 186 | 201 | 234 |
 *
 * The HIGHLIGHTS were already at parity (p95 234 vs 218); the darkest 5 % sat at
 * 127 where the reference has 56. The cause is structural and documented:
 * `CeilingOccluder` blocks the sun in orbit ("as if a ceiling were there", see
 * ORBIT-CEILING in `src/scene/CLAUDE.md`), so every room is lit by fill ALONE —
 * and fill casts nothing (INTERIOR-SHADOW). The full-stack AO that stands in for
 * contact shadow is tuned for WALK (AO-SMALL-ROOM, 5 / 0.7 m) and from 15 m up it
 * reads as a faint contact cue.
 *
 * So orbit gets ONE extra shadow-casting light — a soft, nearly-overhead key, the
 * dollhouse equivalent of a large diffused softbox above an architectural model.
 * It is ADDED light, so the analytic fill is scaled down to keep the highlights
 * where they were, and the AO radius is opened up for the 15 m viewing distance.
 *
 * Pure and three-free, exactly like `look.ts`, so every value here is unit-tested
 * without a renderer.
 */

/** Camera modes this key is allowed in. Orbit only — walk keeps the real ceiling
 *  overhead, so an added overhead key would be light through a solid slab. */
export type OrbitStudioInputs = {
  /** Only the main `Scene` passes `true`. The room editor is a DIFFERENT canvas
   *  with the SAME store, and its `cameraMode` is still `'orbit'`, so the mode
   *  alone cannot tell them apart. Structural, not a runtime test. */
  allow: boolean
  cameraMode: string
  flagOn: boolean
  /** The RESOLVED sun-shadow map size. Gating on the SETTING rather than a tier
   *  name is the rule in `src/scene/CLAUDE.md`'s tier-vocabulary preamble: a key
   *  that casts costs a shadow pass, so it only mounts where shadows already run
   *  (`realistic` at either device class; `performance` resolves to 0). */
  shadowMapSize: number
}

/**
 * Direction the key arrives FROM, unnormalised (`studioKeyDirection` normalises).
 *
 * Nearly overhead with a slight tilt: straight down would leave every vertical
 * wall at `N·L = 0`, i.e. no wall gradient at all, which is half of what the
 * reference frame reads as. At this tilt a wall facing +x takes 0.32 of the key
 * and one facing −x takes none, so opposite walls of the same room separate.
 */
export const STUDIO_KEY_DIR = [0.35, 1, 0.25] as const

/**
 * Tuning for the studio key. Every number here was swept against the acceptance
 * targets (p05 ≤ 90, p25 ≤ 140, p95 in 217–235, sofa under/open floor 0.58–0.75)
 * — the arm table lives in `docs/open-graphics-decisions.md` item (ad).
 */
export const ORBIT_STUDIO = {
  /** How far up the plan centre the light sits. Only the shadow camera cares
   *  (a directional light's position sets nothing else); matched to the sun's
   *  `SUN_DISTANCE` so both shadow frusta have the same near/far regime. */
  distance: 25,
  /** Key intensity, at full day. Swept 0.8 / 1.4 / 1.8 / 2.2 against the fill
   *  compensation below — see the arm table in item (ad). Past ~1.4 the extra key
   *  and the extra fill cut cancel: p05 moved 118.9 → 117.7 from 1.4/0.40 to
   *  2.2/0.25, which is noise. */
  intensity: 1.4,
  /**
   * What the analytic fill (hemisphere + flat ambient) is multiplied by while the
   * key is live. The key is ADDED light, so without this the whole frame lifts
   * and p95 leaves the 217–235 band — this buys the shadow depth back out of the
   * fill rather than out of the exposure, which is the same trade `PHOTO_FILL_SCALE`
   * makes for the walk view.
   */
  fillScale: 0.4,
  /** VSM blur kernel radius in shadow-map texels. On the default flat the key's
   *  map resolves 1024 over a 19 m frustum ⇒ 18.6 mm/texel, so this is a
   *  ~9–11 cm penumbra on the floor — the soft edge a diffused overhead source
   *  throws, and inside the 8–12 cm target. */
  shadowRadius: 5,
  blurSamples: 12,
  normalBias: 0.02,
  bias: -0.0002,
  /**
   * Ceiling on the key's shadow map. It is a SOFT light — a 5-texel VSM blur
   * discards resolution above this anyway (the same argument SHADOW-TEXEL makes
   * for the sun) — so it never pays for more than the sun already spends on the
   * default flat, and the second shadow pass stays cheap.
   */
  mapSizeCap: 1024,
  /** Head/foot room on the fitted shadow slab (m) — see {@link studioShadowRange}. */
  slabMargin: 0.5,
  /**
   * Orbit AO. The shipped full-stack values are `radius 0.7 / intensity 5`
   * (AO-SMALL-ROOM), calibrated for a WALK camera standing in a 1.9 m kitchen —
   * at 15 m a 0.7 m kernel is a few pixels wide and delivers no contact cue.
   * Orbit sees whole rooms at once, so it can afford the metre-scale kernel
   * `.196` originally shipped, and then some. Swept at the shipped key: intensity
   * 6 → under/open 0.714, 9 → 0.688, **10 → 0.683**, 12 → 0.670, against a Cycles
   * anchor of 0.635 — and 12 costs 24 counts of WHOLE open floor (176 → 152),
   * which is AO-SMALL-ROOM's failure mode reappearing, so it is not taken.
   * Walk keeps 0.7 / 5 byte-identical.
   */
  ao: { radius: 1.2, intensity: 10 },
} as const

/**
 * Marker written on the studio key's `shadow.camera.userData` (OCCLUDER-OPT-OUT).
 *
 * **Why a marker and not `layers`.** three 0.184's `WebGLShadowMap.renderObject`
 * filters shadow casters with `object.layers.test( camera.layers )` — and that
 * `camera` is the **MAIN render camera**, not `shadow.camera` (`shadowCamera` is
 * a separate argument, used only for the model-view matrix and the draw). So
 * there is no per-light layer channel to exclude the occluder on: moving the
 * occluder to its own layer would drop it out of the SUN's map too (and out of
 * the beauty pass, where it is deliberately present-but-invisible).
 *
 * **Why not a shadow-camera near plane.** A near plane clips by depth ALONG the
 * view axis, and for a TILTED overhead light a horizontal ceiling plane spans a
 * range of such depths ~10 m wide across a 14 m plan while the ceiling→floor
 * separation is only `dir.y × 2.6 ≈ 2.4 m`. The two ranges overlap, so no near
 * plane separates ceiling from floor unless the key is exactly vertical — which
 * would leave every wall at `N·L = 0`.
 *
 * **What is used instead**: `Object3D.onBeforeShadow` / `onAfterShadow`, three's
 * own per-object, per-shadow-camera hooks. When the shadow camera carrying this
 * marker is the one drawing, the occluder turns `colorWrite` + `depthWrite` off
 * on the depth material for that one draw and restores them immediately after,
 * so it contributes nothing to the key's depth/variance map and is on the
 * identical engine path in the sun's. Verified live rather than reasoned: with
 * the marker deleted at runtime the living-room floor goes straight back to the
 * blocked reading (under 133.1 / open 176.4 against the flag-off 132.1 / 176.3),
 * and with it present the key reaches the floor (under 138.7 / open 185.4).
 */
export const STUDIO_KEY_SHADOW_TAG = 'orbitStudioKeyShadow'

/** Unit vector the key arrives from (+y is up). Pure. */
export function studioKeyDirection(): [number, number, number] {
  const [x, y, z] = STUDIO_KEY_DIR
  const len = Math.hypot(x, y, z)
  return [x / len, y / len, z / len]
}

/** World position for the key, `distance` up its own direction from the plan
 *  centre — so its shadow frustum is centred on the plan exactly like the sun's. */
export function studioKeyPosition(
  center: readonly [number, number, number],
): [number, number, number] {
  const d = studioKeyDirection()
  return [
    center[0] + d[0] * ORBIT_STUDIO.distance,
    center[1] + d[1] * ORBIT_STUDIO.distance,
    center[2] + d[2] * ORBIT_STUDIO.distance,
  ]
}

/**
 * Near/far for the key's shadow camera, fitted to the SLAB the dollhouse
 * actually occupies (ceiling section cut down to just below the floor).
 *
 * **This is not tidiness — it is what makes the key cast at all.** three runs
 * VSM here, and VSM reconstructs occlusion from the mean and variance of depth
 * over a blurred neighbourhood, so its Chebyshev bound degrades as the
 * occluder→receiver separation shrinks relative to the camera's depth RANGE. At
 * the sun's `near 1 / far 59.5` a sofa seat 0.4 m above the floor is 0.7 % of the
 * range and the bound reports the floor beneath it as very nearly lit: measured,
 * the under/open floor ratio moved only **0.750 → 0.727** while the key was
 * carrying three quarters of the floor's light. Fitted to the ~15 m slab the
 * plan occupies, the same separation is ~4× more of the range.
 *
 * The tilt is why `spread` exists: depth along the view axis varies across a
 * horizontal plane by `(|dx| + |dz|) × halfExtent`, so the ceiling's depths and
 * the floor's depths interleave — which is also the reason a near plane cannot
 * be used to hide the ceiling occluder (see {@link STUDIO_KEY_SHADOW_TAG}).
 */
export function studioShadowRange(
  center: readonly [number, number, number],
  halfExtent: number,
  ceilingHeight: number,
): { near: number; far: number } {
  const d = studioKeyDirection()
  const yCam = center[1] + d[1] * ORBIT_STUDIO.distance
  const spread = (Math.abs(d[0]) + Math.abs(d[2])) * halfExtent
  const depthTo = (y: number) => (yCam - y) / d[1]
  const top = center[1] + ceilingHeight + ORBIT_STUDIO.slabMargin
  const bottom = center[1] - ORBIT_STUDIO.slabMargin
  return {
    near: Math.max(0.5, depthTo(top) - spread),
    far: depthTo(bottom) + spread,
  }
}

/**
 * Is the studio key live? Pure, so the "orbit only, never the editor, never
 * walk, never a shadowless tier" contract is a unit test rather than a claim.
 */
export function orbitStudioActive(i: OrbitStudioInputs): boolean {
  return i.allow && i.flagOn && i.cameraMode === 'orbit' && i.shadowMapSize > 0
}

/**
 * Fill multiplier for the analytic hemisphere + ambient while the key is live.
 *
 * **It rides the same eased day level the key does**, so the two cannot fall out
 * of step: at full day the fill pays for a full-strength key, and at night — when
 * the key has ramped to nothing — the fill is back at `1` and the night dollhouse
 * is lit exactly as ORBIT-NIGHT-CAPS tuned it. A constant compensation would take
 * fill away from a night interior in exchange for a key that is no longer there.
 *
 * Returns exactly `1` (byte-identical) whenever the key is not live.
 * `override` is the DEV sweep seam (`?studioFill=`); it replaces the constant,
 * not the ramp.
 */
export function orbitStudioFillScale(active: boolean, dayLevel: number, override?: number): number {
  if (!active) return 1
  const d = Math.min(1, Math.max(0, Number.isFinite(dayLevel) ? dayLevel : 0))
  const target = override ?? ORBIT_STUDIO.fillScale
  return 1 + (target - 1) * d
}

/** Key intensity for an eased day level. The key is a DAYLIGHT stand-in — a
 *  constant one measured the 20:00 dollhouse mean 106.9 → 123.6 and p05 19 → 49,
 *  i.e. a night frame lit by a midday softbox. `override` is `?studioKey=`. */
export function orbitStudioKeyIntensity(dayLevel: number, override?: number): number {
  const d = Math.min(1, Math.max(0, Number.isFinite(dayLevel) ? dayLevel : 0))
  return (override ?? ORBIT_STUDIO.intensity) * d
}

/**
 * N8AO radius/intensity for the current arm.
 *
 * Returns the caller's own values unchanged when the key is not live, so walk,
 * the room editor and the flag-off arm cannot move.
 *
 * **It rides the day level too, and that is deliberate.** AO is a geometric cue
 * rather than a light, so ramping it looks wrong on first reading — but its job
 * HERE is to carry the contact shadow the overhead daylight key cannot resolve
 * from 15 m, and at night there is no such key. Measured on the 20:00 dollhouse,
 * a constant orbit AO took the frame mean **106.9 → 96.1** and p50 **102.5 →
 * 84**, which re-bases every number ORBIT-NIGHT-CAPS tuned the night dollhouse
 * against for no stated gain. Ramped, the night frame is byte-identical.
 */
export function orbitStudioAo(
  active: boolean,
  base: { radius: number; intensity: number },
  dayLevel: number,
): { radius: number; intensity: number } {
  if (!active) return base
  const d = Math.min(1, Math.max(0, Number.isFinite(dayLevel) ? dayLevel : 0))
  return {
    radius: base.radius + (ORBIT_STUDIO.ao.radius - base.radius) * d,
    intensity: base.intensity + (ORBIT_STUDIO.ao.intensity - base.intensity) * d,
  }
}
