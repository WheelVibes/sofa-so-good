/**
 * WINDOW-EXPOSURE — how much of the viewport the glazing covers, and the
 * auto-exposure ramp that re-exposes the exterior when it covers a lot of it.
 *
 * **The defect (audit finding S1).** `EXTERIOR_DAY_BOOST_BLOWN` is calibrated at
 * ROOM-SCALE framing: standing back in the living/dining, ~33 % of the aperture's
 * pixels sit at or past 240 counts, which is what a real interior photograph and a
 * Cycles render of the same pose both measure. That calibration is correct and must
 * not move. But it is a CONSTANT, and a real camera's exposure is not: walk up to
 * the glazing until it fills the frame and a real camera re-exposes for what is now
 * the dominant subject — the estate comes back, the neighbour block's facade and its
 * window grid stay legible. The app instead keeps the room-scale ratio at every
 * distance, so `walk-into-wall-slide` frames 32-168 are a uniform ~255 field with
 * only the mullion grid reading.
 *
 * **The signal.** Aperture coverage: the fraction of the viewport covered by glazing.
 * Estimated on the CPU from the pane rectangles and the camera's view-projection —
 * no framebuffer readback, no stencil pass, no extra draw call. Panes are projected
 * into clip space, clipped against the near plane and the four NDC edges
 * (Sutherland-Hodgman), and their areas summed. Overlapping panes double-count; that
 * error only ever pushes coverage UP, i.e. toward re-exposing sooner, never toward
 * disturbing a room-scale pose.
 *
 * Everything here is pure — numbers in, numbers out, no three, no store — so the ramp
 * and the estimator are unit-tested rather than eyeballed in a screenshot.
 */

import type { FloorPlan } from '../../floorplan/types'

/** A glazed rectangle in world metres: four corners, wound consistently. */
export type PaneQuad = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
]

/**
 * The glazed rectangles of a plan, in world metres.
 *
 * WINDOWS ONLY, deliberately. The signal wanted is "how much of the frame is a hole
 * the exterior shines through", and in the default 4-room flat every such hole is a
 * `window` opening: the service-yard door is on an INTERIOR wall (`wall-int-shelter-E`
 * — the yard itself is an open-air room inside the footprint), so counting doors would
 * add a pane that is not an aperture at all. Openings with no height (sill >= head) are
 * dropped rather than contributing a degenerate quad.
 */
export function planApertureQuads(plan: FloorPlan): PaneQuad[] {
  const walls = new Map(plan.walls.map((w) => [w.id, w]))
  const out: PaneQuad[] = []
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue
    const wall = walls.get(o.wallId)
    if (!wall) continue
    const dx = wall.end[0] - wall.start[0]
    const dz = wall.end[1] - wall.start[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    const sill = o.sill ?? 0
    const head = o.head ?? 0
    if (head - sill < 1e-6 || o.width < 1e-6) continue
    const ux = dx / len
    const uz = dz / len
    const a = o.offset
    const b = o.offset + o.width
    const x0 = wall.start[0] + ux * a
    const z0 = wall.start[1] + uz * a
    const x1 = wall.start[0] + ux * b
    const z1 = wall.start[1] + uz * b
    out.push([
      [x0, sill, z0],
      [x1, sill, z1],
      [x1, head, z1],
      [x0, head, z0],
    ])
  }
  return out
}

/** A clip-space vertex. */
type ClipV = [number, number, number, number]

/** Column-major 4x4, three's `Matrix4.elements` layout. */
function transform(m: ArrayLike<number>, x: number, y: number, z: number): ClipV {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ]
}

/** Smallest positive w a vertex may keep — below it the perspective divide explodes. */
const W_EPS = 1e-4

/** Sutherland-Hodgman against `w > W_EPS`, in homogeneous clip space. */
function clipNear(poly: ClipV[]): ClipV[] {
  const out: ClipV[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = a[3] - W_EPS
    const db = b[3] - W_EPS
    if (da >= 0) out.push(a)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t,
      ])
    }
  }
  return out
}

type P2 = [number, number]

/** Sutherland-Hodgman against one NDC half-plane (`axis` 0 = x, 1 = y). */
function clipHalf(poly: P2[], axis: 0 | 1, sign: 1 | -1): P2[] {
  const inside = (p: P2) => sign * p[axis] <= 1
  const out: P2[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const da = 1 - sign * a[axis]
    const db = 1 - sign * b[axis]
    if (inside(a)) out.push(a)
    if (inside(a) !== inside(b)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

function shoelace(poly: P2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

/**
 * Fraction of the viewport (0..1) covered by `quads` under a view-projection matrix
 * (column-major, three's `Matrix4.elements`). The NDC square has area 4, so each
 * clipped polygon's shoelace area is divided by 4. Sum, capped at 1.
 */
export function apertureCoverage(quads: readonly PaneQuad[], viewProj: ArrayLike<number>): number {
  let total = 0
  for (const quad of quads) {
    const clipped = clipNear(quad.map((c) => transform(viewProj, c[0], c[1], c[2])))
    if (clipped.length < 3) continue
    let poly: P2[] = clipped.map((v) => [v[0] / v[3], v[1] / v[3]])
    poly = clipHalf(poly, 0, 1)
    if (poly.length < 3) continue
    poly = clipHalf(poly, 0, -1)
    if (poly.length < 3) continue
    poly = clipHalf(poly, 1, 1)
    if (poly.length < 3) continue
    poly = clipHalf(poly, 1, -1)
    if (poly.length < 3) continue
    total += shoelace(poly) / 4
  }
  return Math.min(1, total)
}

/**
 * Coverage at which re-exposure BEGINS. Above the calibrated room-scale poses, by
 * construction and by measurement: the `lightmap-night-floor-verify` arm-A living pose
 * (10.9, 5.2) facing the living/dining glazing measures **0.1175** on the 390x844 phone
 * viewport the reference frame was captured at (0.1177 at 1200x900 — the aspect-compensated
 * walk fov makes them agree), and its kitchen pose measures **0.0000** (no glazing in view).
 * 0.30 leaves 2.6x of headroom over the worst of them, so every calibrated pose renders
 * byte-identically. The `walk-into-wall-slide` approach crosses it between 3.5 m and 3.2 m
 * from the glazing (0.317 -> 0.397) and saturates at 1.0 by 2.0 m, which is where the finding's
 * uniform white field is.
 */
export const BLOWOUT_RAMP_START = 0.3
/** Coverage at which re-exposure is FULL — the glazing owns the frame. */
export const BLOWOUT_RAMP_FULL = 0.6
/**
 * The boost the exterior re-exposes TO, as a fraction of `BLOWN_RATIO_AT_REF` (8).
 *
 * 0.5 => boost 4. That is not a taste call: the live sweep recorded in
 * `features/flags/registry.ts` and `Estate.tsx` measured near-white fraction against
 * boost at the reference pose — 1.1 -> 0.0 % (p95 208 counts), 4 -> 0.0 % (p95 ~229),
 * 6 -> 21.0 %, 8 -> ~33 %. Boost 4 is therefore the largest value at which NO aperture
 * pixel is near-white, which puts the neighbour block's facade at ~229 counts (inside
 * the 200-230 the finding asks for) with its window grid still distinct. Going lower
 * buys legibility the finding did not ask for at the cost of the blown look the whole
 * feature exists to produce.
 */
export const BLOWOUT_REEXPOSED_SCALE = 0.5

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

/**
 * Multiplier on the blown exterior boost for a given aperture coverage: exactly 1 at
 * or below {@link BLOWOUT_RAMP_START} (so a room-scale pose is bit-for-bit what it was),
 * {@link BLOWOUT_REEXPOSED_SCALE} at or above {@link BLOWOUT_RAMP_FULL}, smoothstepped
 * between. Monotonically non-increasing in coverage, which is the property that matters.
 */
export function adaptiveBlowoutScale(coverage: number): number {
  if (!Number.isFinite(coverage) || coverage <= BLOWOUT_RAMP_START) return 1
  if (coverage >= BLOWOUT_RAMP_FULL) return BLOWOUT_REEXPOSED_SCALE
  const t = (coverage - BLOWOUT_RAMP_START) / (BLOWOUT_RAMP_FULL - BLOWOUT_RAMP_START)
  return 1 - smoothstep(t) * (1 - BLOWOUT_REEXPOSED_SCALE)
}

/** Auto-exposure time constant, seconds — slow enough to read as an eye/camera
 *  adapting, fast enough that it has settled by the time you stop walking. */
export const BLOWOUT_TAU_S = 0.3

/**
 * One exponential step toward `target` with time constant `tau`, frame-rate
 * independent (`1 - exp(-dt/tau)`), so 60 Hz and 12 Hz agree. A non-finite or
 * non-positive `dt` snaps — that is what a first frame and a tab-restore both want.
 */
export function easeBlowout(
  current: number,
  target: number,
  dt: number,
  tau = BLOWOUT_TAU_S,
): number {
  if (!Number.isFinite(current)) return target
  if (!Number.isFinite(dt) || dt <= 0 || tau <= 0) return target
  return current + (target - current) * (1 - Math.exp(-dt / tau))
}
