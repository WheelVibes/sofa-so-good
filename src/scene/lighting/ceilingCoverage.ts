/**
 * CEILING-EXPOSURE (audit finding N4) — what a camera does when the ceiling fills
 * the frame.
 *
 * **The defect.** Pitch up in walk mode and the top of the frame becomes a
 * featureless near-white field: `walk-pitch-limits-phone` frame 222 measures the
 * ceiling band at **mean 223.9, 28.8 % >= 240, sd 23.5** and holds there to the end
 * of the clip. Three things stack, and none of them is a bug on its own:
 *
 *  1. The ceiling is the brightest albedo in the home — `RoomCeiling`/`Ceiling` paint
 *     it `#fafafa` (linear ~0.947), matte, `roughness 1`.
 *  2. Every ceiling fixture hangs a few decimetres BELOW it. The default flat's
 *     `ceiling-light` spec (`furniture/lightEmitters.ts`) puts the bulb at
 *     `mount - drop - 0.05` = **2.05 m** under a 2.6 m slab, and a `flush` one at
 *     **2.50 m** — 0.10 m away. Three's point light is a true point with `decay 2`
 *     (`FurnitureLights.tsx:111`), so irradiance at the slab is `I / d²`:
 *     `9 / 0.55²` = **29.8** for the pendant, `9 / 0.10²` = **900** for a flush
 *     fitting, against `9 / 1.5²` = 4 at head height. Nothing in the frame at a
 *     normal pose is within an order of magnitude of that.
 *  3. On top of it the surface carries the `lampBounce` interreflection term
 *     (`visibilityLightmap.ts:880`) and the fixture's own bloom.
 *
 * So the ceiling is genuinely, physically the brightest thing in a lit flat, seen at
 * point-blank range. That is not the part to fix. **What is missing is the camera.**
 * Point a real camera straight up at a lit ceiling and it stops down — by one and a
 * half to two stops — and the ceiling comes back as a surface with a lamp pool on it
 * rather than a white card. The app instead holds the room-scale exposure
 * (`Lighting.tsx`'s `grade(altitude).exposure`) at every pitch, exactly the way
 * WINDOW-EXPOSURE (finding S1) held the room-scale blown ratio at every distance.
 *
 * This module is that fix, deliberately built as the twin of
 * `estate/apertureCoverage.ts`:
 *
 *  - **Signal.** Ceiling coverage — the fraction of the viewport the ceiling planes
 *    cover — estimated on the CPU from `occluderRectsForPlan` (the same rectangles
 *    at the resolved ceiling height that already roof the sun), merged into one
 *    rectangle and projected through the camera's view-projection. No readback, no
 *    extra pass; it reuses `apertureCoverage`'s clipper verbatim.
 *  - **Response.** A smoothstep ramp on `toneMappingExposure`, exactly 1 at or below
 *    {@link CEILING_RAMP_START}, {@link CEILING_REEXPOSED_SCALE} at or above
 *    {@link CEILING_RAMP_FULL}.
 *
 * **Why an exposure scale and not a light clamp.** The two alternatives both fail the
 * byte-identity requirement. Tuning `distance`/`decay` per fixture changes every lit
 * frame in the home, including the calibrated poses; a shoulder in the tone stage
 * changes every pixel above its knee, and the calibrated living pose already has
 * 1.12 % of its aperture crop past 240. A coverage-gated exposure is the only one of
 * the three that is EXACTLY the identity below its ramp start — and it is also the
 * only one that cannot re-rank the frame, because a uniform multiplier preserves
 * order: the pendant pool stays the brightest region by construction, which is the
 * second half of N4's acceptance criterion.
 *
 * Pure — numbers in, numbers out, no three, no store — so the ramp and the
 * calibrated-pose headroom are unit-tested rather than eyeballed.
 */

import { occluderRectsForPlan } from '../../apartment/ceiling/occluderRects'
import type { FloorPlan } from '../../floorplan/types'
import { apertureCoverage, type PaneQuad } from '../estate/apertureCoverage'

/**
 * The ceiling of a plan as ONE quad, in world metres, for {@link apertureCoverage}'s clipper:
 * the bounding rectangle of every roofed room, at the highest of their resolved ceiling heights.
 *
 * `occluderRectsForPlan` supplies the rooms — it is already "one horizontal rectangle per roofed
 * room at that room's resolved ceiling height, every storey, external rooms (balcony, service
 * yard, AC ledge) excluded", i.e. exactly the surfaces that read as "the ceiling" to a camera
 * inside the flat. Reusing it means a raised ceiling or a room marked external moves this signal
 * and the shadow occluder together instead of drifting apart.
 *
 * **They are merged into one rectangle rather than summed, and that is load-bearing.** The
 * clipper sums per-quad areas, so overlapping quads DOUBLE-COUNT — and unlike the glazing case
 * (a handful of disjoint panes) the room rects tile the plan and an L-shaped room's AABB laps
 * over its neighbour's. Measured on the default flat at the calibrated living pose on the phone
 * viewport, the per-room sum reads 0.372 against 0.368 for the camera's own room alone, so the
 * inflation is small — but it is an error that grows with room count and it eats exactly the
 * byte-identity headroom the ramp start depends on. One rectangle has none of it.
 *
 * The estimator has no occlusion, so a ceiling pixel hidden behind a wall still counts. That is
 * acceptable here in a way it would not be for glazing: every ceiling point is at the same
 * height, so every one of them projects ABOVE THE HORIZON, and the measured series below is
 * monotonic in pitch — which is the only property the ramp uses.
 */
export function planCeilingQuads(plan: FloorPlan): PaneQuad[] {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let y = Number.NEGATIVE_INFINITY
  for (const r of occluderRectsForPlan(plan)) {
    if (!(r.w > 1e-6) || !(r.d > 1e-6)) continue
    minX = Math.min(minX, r.cx - r.w / 2)
    maxX = Math.max(maxX, r.cx + r.w / 2)
    minZ = Math.min(minZ, r.cz - r.d / 2)
    maxZ = Math.max(maxZ, r.cz + r.d / 2)
    y = Math.max(y, r.y)
  }
  if (!(maxX > minX) || !(maxZ > minZ) || !Number.isFinite(y)) return []
  return [
    [
      [minX, y, minZ],
      [maxX, y, minZ],
      [maxX, y, maxZ],
      [minX, y, maxZ],
    ],
  ]
}

/**
 * Fraction of the viewport covered by the ceiling planes under a view-projection
 * matrix (column-major, three's `Matrix4.elements`).
 *
 * Literally {@link apertureCoverage} — the estimator is "sum of clipped projected quad areas
 * over the NDC square", which knows nothing about glazing. Aliased rather than re-implemented so
 * there is one clipper (and one set of near-plane/NDC edge cases) in the app, and named here so
 * call sites and tests read in the units of the thing being measured.
 */
export function ceilingCoverage(quads: readonly PaneQuad[], viewProj: ArrayLike<number>): number {
  return apertureCoverage(quads, viewProj)
}

/**
 * Coverage at which the stop-down BEGINS: **0.60**, set from measurement, not from intuition.
 *
 * The intuition was badly wrong and the number records it. A level walk pose "obviously" shows
 * the ceiling as a thin wedge between the far wall's top edge and the top of the frame — but
 * with no occlusion every ceiling point projects above the horizon, and on a 390x844 PORTRAIT
 * phone frame with the aspect-widened walk fov that is a third of the picture. Swept over pitch
 * on the default flat (`ceilingCoverage.test.ts` pins the level ends of these series):
 *
 * | pose / viewport | -0.05 rad | 0 | 0.3 | 0.5 | 0.9 | 1.1 |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | living, 390x844 | 0.388 | 0.410 | 0.537 | 0.625 | 0.852 | 1.000 |
 * | living, 1200x900 | 0.291 | 0.324 | 0.514 | 0.644 | 0.951 | 0.993 |
 * | kitchen, 390x844 | 0.382 | 0.403 | 0.529 | 0.617 | 0.847 | 0.988 |
 * | kitchen, 1200x900 | 0.261 | 0.290 | 0.471 | 0.598 | 0.878 | 0.930 |
 *
 * The four calibrated poses (`scripts/scenarios/lightmap-night-floor-verify.json` arm A, at
 * their own pitches of -0.02 and -0.05 rad) top out at **0.388**, so 0.60 leaves **1.55x** of
 * headroom over the worst of them and every calibrated frame renders byte-identically. The
 * finding's pose — held at the upper pitch clamp — saturates the signal.
 */
export const CEILING_RAMP_START = 0.6
/** Coverage at which the stop-down is FULL — the ceiling owns the frame. Reached at roughly
 *  0.9 rad of pitch, i.e. well short of the clamp the finding's clip sits at. */
export const CEILING_RAMP_FULL = 0.9
/**
 * The exposure the camera stops down TO when the ceiling owns the frame: **0.25**,
 * i.e. exactly two stops.
 *
 * Derived from the finding's own histogram, not picked. The ceiling band at frame 222
 * reads mean 223.9, sd 23.5, **28.8 % >= 240** — so 240 counts sits at about the 71st
 * percentile, and the acceptance criterion (>= 240 under 5 %) needs 240 pushed out to
 * about the 95th, a shift of `(1.645 - 0.553) * 23.5` ~= **26 counts**. The app's tone
 * curve near the highlight shoulder runs at roughly 17-19 counts per e-fold of scene
 * luminance (fitted on the three boost/percentile pairs `Estate.tsx` already records:
 * boost 1.1 -> p95 208, 4 -> ~229, 8 -> ~243). 26 counts is therefore ~1.4 e-folds,
 * and `exp(-1.4)` = 0.246. Two stops is the round number on the other side of it, and
 * it is squarely inside what a centre-weighted meter does when a white ceiling
 * replaces a room in the frame.
 */
export const CEILING_REEXPOSED_SCALE = 0.25

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * Multiplier on `toneMappingExposure` for a given ceiling coverage: exactly 1 at or
 * below {@link CEILING_RAMP_START} (so every calibrated pose is bit-for-bit what it
 * was — `1` is the exact IEEE-754 identity for the multiply at the call site),
 * {@link CEILING_REEXPOSED_SCALE} at or above {@link CEILING_RAMP_FULL}, smoothstepped
 * between. Monotonically non-increasing in coverage, which is the property that
 * matters: more ceiling can never mean more exposure.
 */
export function ceilingExposureScale(coverage: number): number {
  if (!Number.isFinite(coverage) || coverage <= CEILING_RAMP_START) return 1
  if (coverage >= CEILING_RAMP_FULL) return CEILING_REEXPOSED_SCALE
  const t = (coverage - CEILING_RAMP_START) / (CEILING_RAMP_FULL - CEILING_RAMP_START)
  return 1 - smoothstep(t) * (1 - CEILING_REEXPOSED_SCALE)
}
