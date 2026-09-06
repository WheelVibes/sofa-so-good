/**
 * curtainStandoff.ts — where a curtain hangs relative to its wall (CURTAIN-FLUSH).
 *
 * A curtain item snaps onto its window's host wall **centre-line** and the
 * `Curtain` primitive then pushes the fabric into the room by
 * `CURTAIN_PANEL_BASE_Z + standoff`. Before `curtainFlush` the standoff was one
 * fixed number (0.2) chosen against a 0.2 m external wall and copied into four
 * hand-written seed entries whose ORIGINS had additionally drifted 0.18 m
 * (bedrooms) / 0.22 m (living) off the centre-line — so, measured in-scene, the
 * fabric hung 0.33 / 0.37 m off the wall face and the rod floated a hand-span
 * into the room, in the living room straight across the aircon unit.
 *
 * This module derives the standoff instead, **relative to the wall FACE**, from
 * the two things that actually constrain it:
 *
 *  - what the window assembly projects into the room
 *    (`apartment/windowProjection.ts` — 0.04 m past a 0.2 m wall's face, 0.09 m
 *    past a 0.1 m one, dominated by the interior sill ledge); and
 *  - how deep the fabric's fold TROUGHS dig back behind the panel plane
 *    (`primitives/Curtain.tsx:curtainFoldZ`, deepest in the open/gathered state).
 *
 * Everything here is pure arithmetic (no three/React/store), so it unit-tests
 * headlessly and the seeding, the live placement snap and the primitive's own
 * fallback all read the same derivation.
 */

/** Panel-plane z (m) the `Curtain` primitive uses at `standoff = 0` — i.e. the
 *  offset baked into the primitive, which the standoff adds to. */
export const CURTAIN_PANEL_BASE_Z = 0.05
/** Rod z (m) relative to the panel plane: the rod sits 10 mm BEHIND the fabric
 *  plane (toward the wall), as a real rod carried on short wall brackets does. */
export const CURTAIN_ROD_PANEL_OFFSET = -0.01
/** Fold wave amplitude (m) at the hem — `primitives/Curtain.tsx:FOLD_DEPTH`. */
export const CURTAIN_FOLD_DEPTH = 0.05
/** Fold-depth multiplier in the OPEN/gathered state (`panelTransform`'s
 *  `depthScale` at `drawAmount = 0`) — the deepest the fabric ever gets. */
const CURTAIN_OPEN_DEPTH_SCALE = 1.8
/**
 * Peak |`curtainFoldZ`| as a multiple of `FOLD_DEPTH`, at `depthScale = 1`.
 * `curtainFoldZ` is `depth × amp × taper × sin(...)` where `amp` varies ±0.18
 * and `taper` ≤ 1, so the naive bound is 1.18 — but the amplitude peak does NOT
 * coincide with the sine trough, and the true extremum sampled densely over a
 * panel is **1.0157**. Rounded UP to 1.02 so the derived clearance is
 * conservative; pinned by `curtainStandoff.test.ts` against the real function.
 */
export const CURTAIN_FOLD_PEAK = 1.02
/** Smallest gap (m) we ever leave between the wall face and the panel plane,
 *  even when nothing projects — a rod on real brackets is never truly flush. */
export const CURTAIN_MIN_FACE_GAP = 0.1
/** Air gap (m) left between the deepest fold trough and whatever it clears. */
export const CURTAIN_CLEARANCE = 0.01

/** Deepest (m) the fabric digs back behind its own panel plane, open state. */
export function curtainTroughDepth(
  foldDepth = CURTAIN_FOLD_DEPTH,
  openDepthScale = CURTAIN_OPEN_DEPTH_SCALE,
): number {
  return foldDepth * CURTAIN_FOLD_PEAK * openDepthScale
}

export interface CurtainStandoffInput {
  /** Host wall thickness (m) — `floorplan/planGeometry.ts:planWallThickness`. */
  wallThickness: number
  /** How far (m) the window assembly reaches past that wall's interior face —
   *  `apartment/windowProjection.ts:windowInteriorProjection`. */
  sillProjection: number
  /** Fabric fold amplitude (m); defaults to the primitive's. */
  foldDepth?: number
  /** Open-state fold-depth multiplier; defaults to the primitive's. */
  openDepthScale?: number
}

/**
 * The `standoff` prop (m) for a curtain on a `wallThickness` wall whose window
 * projects `sillProjection` past its interior face.
 *
 * The panel plane is placed at `wallFace + max(CURTAIN_MIN_FACE_GAP,
 * sillProjection + troughDepth + CURTAIN_CLEARANCE)`, measured from the wall
 * CENTRE-LINE the snap plants the item on; the returned standoff is that minus
 * the primitive's baked-in `CURTAIN_PANEL_BASE_Z`.
 *
 * On the default flat's 0.2 m external walls that is a 0.142 m panel plane /
 * 0.132 m rod off the face — the deepest open fold trough then clears the sill
 * nose by 10 mm and the bare wall by 50 mm.
 *
 * **Why not the 0.10 m "flush" gap on those walls**: the open-state troughs are
 * 0.092 m deep and the sill nose projects 0.04 m, and an open panel bunches at
 * the curtain's OUTER edges, which still straddle the sill ledge (the ledge is
 * `glass + 0.10` wide, the curtain `glass + 0.36`). Any panel plane closer than
 * `0.04 + 0.092` therefore buries the gathered folds in the sill. Clearing the
 * sill and a ≤ 0.03 m wall gap are mutually exclusive for as long as the sill
 * projects at all; no-penetration wins.
 */
export function curtainStandoff(i: CurtainStandoffInput): number {
  const face = Math.max(0, i.wallThickness) / 2
  const trough = curtainTroughDepth(i.foldDepth, i.openDepthScale)
  const gap = Math.max(
    CURTAIN_MIN_FACE_GAP,
    Math.max(0, i.sillProjection) + trough + CURTAIN_CLEARANCE,
  )
  return round(face + gap - CURTAIN_PANEL_BASE_Z)
}

/** Panel-plane distance (m) from the wall's interior FACE for a given standoff
 *  — the inverse of `curtainStandoff`, for probes/tests and the docs' numbers. */
export function curtainFaceGap(standoff: number, wallThickness: number): number {
  return CURTAIN_PANEL_BASE_Z + standoff - Math.max(0, wallThickness) / 2
}

// ── Obstacles above the window ────────────────────────────────────────────────

/** Half-thickness (m) of the widest rod part — the finial sphere (r 0.025),
 *  which is what actually sets the rod assembly's top. Mirrors
 *  `primitives/Curtain.tsx`'s `height + 0.04` rod centre + a 0.025 finial. */
export const CURTAIN_ROD_TOP_OFFSET = 0.04 + 0.025
/** Clearance (m) kept between the rod's top and an obstacle's underside. */
export const CURTAIN_ROD_OBSTACLE_CLEARANCE = 0.03
/**
 * How far (m) we are willing to shorten a curtain to duck under an obstacle.
 * A fan-coil unit sitting over the head of the window is a real condition that
 * a real curtain track goes UNDER; a sconce or a shelf at mid-wall height is
 * not — dropping the rod to its underside would leave a knee-high curtain. The
 * cap is the discriminator: an obstacle that cannot be cleared inside it is
 * left alone (and reported by `scripts/dev-probes/curtain-clearance.mjs`).
 */
export const CURTAIN_ROD_MAX_DROP = 0.7

/** An axis-aligned box, in the CURTAIN's local frame: `x` along the wall from
 *  the curtain's own centre, `y` above the floor, `z` out of the wall
 *  centre-line toward the room. Each pair is `[min, max]`. */
export interface CurtainObstacleBox {
  x: [number, number]
  y: [number, number]
  z: [number, number]
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

export interface CurtainRodHeightInput {
  /** The rod height (m) placement would use with no obstacle. */
  preferredHeight: number
  /** Curtain `width` (m) — the rod spans `width + 0.2` (finial to finial). */
  width: number
  /** The item's `standoff` prop, for the panel/rod z span. */
  standoff: number
  /** Obstacles in the curtain's local frame. */
  obstacles: readonly CurtainObstacleBox[]
  /** Fabric fold amplitude (m); defaults to the primitive's. */
  foldDepth?: number
  /** Open-state fold-depth multiplier; defaults to the primitive's. */
  openDepthScale?: number
}

/**
 * Rod height (m) for a curtain that must not run through a wall-mounted
 * obstacle (an aircon fan-coil over the window, a bulkhead, a valance box).
 *
 * An obstacle counts when it overlaps the curtain in X **and** in Z — the Z span
 * tested is the whole fabric envelope (panel plane ± fold trough), because the
 * rod and the panels hang in the same plane, so an obstacle the rod misses in Y
 * can still be speared by the fabric below it. Every counting obstacle pushes
 * the rod's TOP to `underside − CURTAIN_ROD_OBSTACLE_CLEARANCE`; the lowest
 * demand wins, and anything demanding more than `CURTAIN_ROD_MAX_DROP` is
 * ignored (see that constant).
 *
 * The `Curtain` primitive hangs both panels from `height`, so shortening the
 * returned height shortens the drop with no other change.
 */
export function curtainRodHeight(i: CurtainRodHeightInput): number {
  const halfSpan = i.width / 2 + 0.1 // finial to finial
  const xSpan: [number, number] = [-halfSpan, halfSpan]
  const plane = CURTAIN_PANEL_BASE_Z + i.standoff
  const trough = curtainTroughDepth(i.foldDepth, i.openDepthScale)
  // Fabric envelope in z: troughs behind the plane, crests in front of it (the
  // crest bound is the same peak amplitude, and the rod itself sits behind).
  const zSpan: [number, number] = [plane - trough, plane + trough]
  let height = i.preferredHeight
  for (const o of i.obstacles) {
    if (!overlaps(o.x, xSpan) || !overlaps(o.z, zSpan)) continue
    const demand = o.y[0] - CURTAIN_ROD_OBSTACLE_CLEARANCE - CURTAIN_ROD_TOP_OFFSET
    if (demand >= i.preferredHeight) continue // rod already clears it
    if (i.preferredHeight - demand > CURTAIN_ROD_MAX_DROP) continue // not a valance-height obstacle
    if (demand < height) height = demand
  }
  return round(height)
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000
}
