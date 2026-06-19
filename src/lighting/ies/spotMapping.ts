/**
 * Map a parsed IES photometric profile to Three.js `SpotLight` parameters —
 * pure + render-agnostic (returns plain numbers; the R3F component applies them).
 *
 * Three.js `SpotLight`:
 *  - `angle`  — the **half** cone angle (radians, 0…π/2). We use the *field*
 *    half-angle (10 % of peak) so the visible cone matches where light actually
 *    reaches.
 *  - `penumbra` — 0…1 soft edge. Derived from the beam-vs-field ratio: a profile
 *    whose 50 % beam is much narrower than its 10 % field has a soft, gradual
 *    edge (penumbra → 1); a near-collimated beam (beam ≈ field) has a hard edge
 *    (penumbra → 0).
 *  - `intensity` — scaled from the peak candela toward the renderer's existing
 *    point-light intensity range so an IES spot reads at a comparable brightness
 *    to the fixtures around it, just with a directional photometric shape.
 */

import { type IesMetrics, iesMetrics } from './iesProfile'
import type { IesProfile } from './parseIes'

const DEG = Math.PI / 180

/** SpotLight `angle` must stay inside (0, π/2). Clamp to a usable, visible range. */
const MIN_CONE_DEG = 6
const MAX_CONE_DEG = 80

export interface SpotParams {
  /** Half cone angle in radians (Three `SpotLight.angle`). */
  angle: number
  /** Soft-edge fraction 0…1 (Three `SpotLight.penumbra`). */
  penumbra: number
  /** Intensity in the renderer's point-light range (caller multiplies by the
   *  darkness `level`, same as the point-light path). */
  intensity: number
  /** The derived metrics this mapping was based on (handy for UI / tests). */
  metrics: IesMetrics
}

export interface SpotMapOptions {
  /** Base intensity the fixture would have used as a plain point light; the IES
   *  spot is scaled relative to this so it sits in the same brightness family. */
  baseIntensity?: number
}

/**
 * Derive {@link SpotParams} from a parsed profile.
 *
 * `intensity` normalisation: a SpotLight concentrates flux into a cone, so for a
 * comparable lit appearance we keep the fixture's base intensity but nudge it by
 * how tightly the beam is focused (a narrow hotspot reads brighter at its centre).
 */
export function mapIesToSpot(profile: IesProfile, opts: SpotMapOptions = {}): SpotParams {
  const metrics = iesMetrics(profile)
  const base = opts.baseIntensity ?? 7

  // Cone = field half-angle (10 % of peak). Clamp to a renderable range.
  let coneDeg = metrics.fieldAngle / 2
  if (!(coneDeg > 0)) coneDeg = MIN_CONE_DEG // degenerate / missing → narrow default
  coneDeg = Math.min(MAX_CONE_DEG, Math.max(MIN_CONE_DEG, coneDeg))
  const angle = coneDeg * DEG

  // Penumbra from the beam (50 %) vs field (10 %) ratio. beam==field → hard (0);
  // beam much smaller than field → soft (→1).
  let penumbra = 0.4
  if (metrics.fieldAngle > 0 && metrics.beamAngle >= 0) {
    penumbra = 1 - Math.min(1, metrics.beamAngle / metrics.fieldAngle)
  }
  penumbra = Math.min(1, Math.max(0, penumbra))

  // Focus factor: tighter cones get a modest brightness boost (concentrated flux),
  // wider washes are slightly dimmed — keeps overall scene exposure balanced.
  const focus = Math.min(1.6, Math.max(0.7, 30 / Math.max(coneDeg, 1)))
  const intensity = base * focus

  return { angle, penumbra, intensity, metrics }
}
