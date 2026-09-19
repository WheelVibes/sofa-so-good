/**
 * Pure geometry for the camera-facing "dollhouse" wall reveal.
 *
 *  - `orientOutward` finds which way is "out" by probing a short step off each
 *    face of the wall midpoint against an `isInterior(x, z)` test (point-in-room),
 *    correct on non-rectangular plans where a bbox-centre heuristic would fail.
 *  - `facingToward` / `revealStrength` / `wallRevealStrength` fade a wall from the
 *    camera's LOOK DIRECTION only (its outward normal vs the camera forward), so a
 *    wall the camera looks through goes translucent while a far/back wall stays
 *    solid — and, crucially, zoom and pan never change the fade (only orbiting does).
 *  - `cornerNeighbors` returns the walls that share a corner (endpoint), for the
 *    corner-spread rule.
 *
 * Dependency-free so it is fully unit-tested without the R3F/scene stack.
 */

/**
 * Peak opacity a head-on wall keeps at the **default** "Wall fade" strength
 * (WALL-REVEAL-STRENGTH). Shared by all four surfaces (orbit `WallSegment`, the
 * per-room editor `useWallReveal`, and the custom-plan `PlanShell` walls +
 * `PlanDoorLeaf`). Kept very low so a head-on near wall is barely more than an
 * OUTLINE (you look straight into the room) while still not vanishing — vanishing
 * is only reached at the slider's `1.0` end. Lowered from 0.1 → 0.05
 * (WALL-REVEAL-PEAK) for a noticeably stronger peak; stays above the `> 0.02`
 * visible cutoff so the faint outline still renders. The default slider value is
 * `1 − WALL_TRANSLUCENT_MIN` (see `DEFAULT_WALL_REVEAL_STRENGTH`), so the app
 * opens with exactly this floor.
 */
export const WALL_TRANSLUCENT_MIN = 0.05

/**
 * Default "Wall fade" strength (WALL-REVEAL-STRENGTH). `0.95` = a head-on opacity
 * floor of `1 − 0.95 = 0.05` (WALL_TRANSLUCENT_MIN) — the same barely-an-outline
 * head-on fade the retired default "translucent" mode gave. The single slider
 * (0..1, step 0.05) replaces the old three-way translucent / auto-hide / opaque
 * modes: `0` = never fade (fully opaque), `1` = fade fully hidden, in between =
 * the max fade strength.
 */
export const DEFAULT_WALL_REVEAL_STRENGTH = 1 - WALL_TRANSLUCENT_MIN

/**
 * Target opacity for a participating wall from the user's single **fade
 * strength** setting `fade` (WALL-REVEAL-STRENGTH — replaces the retired
 * translucent/auto-hide/opaque modes) and the angle-graded `strength`:
 *  - `fade = 0` → target `1` at every strength = **fully opaque, never fades**
 *    (the caller also skips fading entirely at 0, keeping walls solid).
 *  - `fade = 1` → a head-on wall (`strength = 1`) reaches `0` = **fully hidden**.
 *  - in between → `fade` is the MAX fade strength: the head-on opacity floor is
 *    `1 − fade` (the default `0.95` → `0.05`, WALL_TRANSLUCENT_MIN).
 * The angle grading is preserved across the whole range (a near wall still
 * settles along its facing curve); `fade` only scales how DEEP the peak fade
 * goes. Equivalent to `revealTargetOpacity(strength, 1 − fade)` = `1 − strength ·
 * fade`.
 */
export function revealTargetOpacityForFade(fade: number, strength: number): number {
  return revealTargetOpacity(strength, 1 - fade)
}

/** Increment the "Wall fade" slider steps by (WALL-REVEAL-STRENGTH). */
export const WALL_REVEAL_STRENGTH_STEP = 0.05

/** Format a wall-fade strength for a slider readout: `0` → "Off" (never fades),
 *  `1` → "Hidden" (fades fully away), else a rounded percentage (0.95 → "95%"). */
export function formatWallFade(v: number): string {
  if (v <= 0) return 'Off'
  if (v >= 1) return 'Hidden'
  return `${Math.round(v * 100)}%`
}

/**
 * ANGLE-GRADED reveal (WALL-REVEAL-ANGLE-GRADED — this deliberately REVERSES the
 * retired WALL-REVEAL-BINARY-TARGET decision: see the note below).
 *
 * `REVEAL_ONSET` is the `toward`-camera cosine (see `facingToward`) at which a
 * wall's OWN fade begins: below it the wall's outward surface is only grazing /
 * side-on / turned away from the camera and stays fully solid; at head-on
 * (`toward` = 1) the fade peaks. Kept at 0.25 (≈14° past perpendicular) so a
 * rectangular room's two perpendicular SIDE walls (`toward` ≈ 0) never begin to
 * fade — the old flip-flop where they read ~50% translucent and swapped which
 * side looked "bluer" as you orbited past the axis.
 *
 * -- Why graded now, and what the binary was actually fixing --
 * The retired binary target + hysteresis was introduced to stop a wall RESTING at
 * a mid-band opacity. The real symptom it targeted was FAR walls — the backdrop
 * walls on the far side of the flat, whose INTERIOR surface faces the camera —
 * looking like a washed half-translucent pane. Those must never sit mid-band; they
 * stay FULLY OPAQUE. That is already guaranteed here structurally, NOT by a binary
 * snap: a far wall's outward normal points AWAY from the camera, so `facingToward`
 * is ≤ 0, so `revealStrength` is exactly 0 → opaque. The NEAR walls (outward
 * surface toward the camera, sitting between you and the rooms) are exactly the
 * ones that SHOULD fade gradually and are EXPECTED to rest anywhere along the
 * curve according to their facing angle — a gentle, honest angle-graded translucency
 * is the intended look there, not a binary endpoint. So the curve is a plain
 * monotonic smoothstep (gentle at both ends), NOT biased toward a fast ramp.
 */
export const REVEAL_ONSET = 0.25

/**
 * `toward` at which the OWN-facing curve reaches FULL fade (ORBIT-FADE-DEPTH).
 *
 * **Why this is not 1.** The reveal runs in orbit ONLY (`WallSegment` gates the whole block on
 * `cameraMode === 'orbit'`), and the dollhouse's natural view is DIAGONAL — you orbit to a corner
 * so two facades are visible at once. At a 45 deg azimuth both wall families sit at
 * `toward ~ 0.71`, and grading to 1 spends the top 30 % of the curve on an angle the view never
 * reaches. Measured at the default orbit pose: every faded wall settled at opacity **0.371**, and
 * pushing the user's fade slider to its maximum moved it only to **0.338** — because the limit was
 * never the floor (0.05) but the strength, which topped out near 0.66.
 *
 * `0.72` makes the curve saturate at the facing a diagonal dollhouse actually produces, so those
 * same walls reach the floor instead of resting milky. An axis-aligned view is unaffected in kind:
 * the facade you face head-on was already saturated, and its perpendicular neighbours still read
 * `toward ~ 0` and stay solid.
 *
 * Exactly the argument {@link SPREAD_FULL} already makes for the corner-spread curve — that
 * grading a companion wall over `onset..1` "would leave it nearly invisible in exactly the corner
 * situations it exists for". The own curve had the same defect against the same geometry.
 */
export const REVEAL_FULL = 0.72

/**
 * Lower onset used only for the corner-SPREAD contribution: a wall that shares a
 * corner with a wall fading by its own facing (rule 1) may itself fade from a
 * slighter angle ("at least slightly facing the camera") — so a corner opens up
 * together rather than one wall of it fading alone. Below this even a spread wall
 * stays solid, so a perpendicular side wall at an exactly head-on view still does
 * not fade.
 */
export const SPREAD_ONSET = 0.05

/**
 * `toward` at which the corner-spread curve reaches FULL strength. A corner
 * neighbour of a head-on-faded wall is roughly perpendicular to it, so its own
 * `toward` realistically tops out around ~0.3–0.5 — grading spread on the own
 * curve's onset→1 span would leave it nearly invisible in exactly the corner
 * situations it exists for. A 0.7 peak maps that limited range to a clearly
 * visible partial fade while staying graded (gentle near the onset).
 */
const SPREAD_FULL = 0.7

/**
 * A corner neighbour must be fading by its OWN facing above this strength before
 * it starts pulling its corner neighbours in; the pull ramps smoothly to full by
 * `SPREAD_GATE_FULL` (a smooth gate — a hard cut would pop the neighbour's fade
 * on/off as the gate is crossed mid-orbit, and there is deliberately no hysteresis
 * any more). Reading only OWN (never final) strength is what keeps spread
 * FIRST-DEGREE — it cannot cascade wall→wall→wall around the whole perimeter
 * (WALL-REVEAL-CORNER-SPREAD).
 */
export const SPREAD_GATE = 0.3
export const SPREAD_GATE_FULL = 0.5

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Orient a wall's face normal `(nx, nz)` so it points **outward** (away from the
 * interior). Probes a point `probe` metres off each face of the wall midpoint:
 *  - if the +normal side is interior → outward is the negated normal,
 *  - if the −normal side is interior → outward is the normal as-is.
 * Returns `null` when both sides read interior (an internal partition between
 * two rooms) or neither does (ambiguous) — the caller then leaves the wall solid.
 * `probe` should clear the wall's half-thickness so it lands inside the room.
 */
export function orientOutward(
  midX: number,
  midZ: number,
  nx: number,
  nz: number,
  isInterior: (x: number, z: number) => boolean,
  probe = 0.3,
): { nx: number; nz: number } | null {
  const plus = isInterior(midX + nx * probe, midZ + nz * probe)
  const minus = isInterior(midX - nx * probe, midZ - nz * probe)
  if (plus === minus) return null // both/neither interior → not a clear exterior wall
  return plus ? { nx: -nx, nz: -nz } : { nx, nz }
}

/**
 * How much a wall's outward surface FACES the camera, as a cosine in [-1, 1]:
 *  - `+1` → the outward surface faces the camera HEAD-ON (the camera looks straight
 *    through the wall into the room): a NEAR wall between you and the rooms.
 *  - `0` → the surface is perpendicular to the view (a SIDE wall you're skimming).
 *  - `< 0` → the surface faces AWAY (its interior side is toward you): a FAR/back
 *    wall — its fade strength is 0, so it always stays opaque.
 *
 * `(fwdX, fwdZ)` is the camera forward vector's horizontal (XZ) part; `(outNx,
 * outNz)` the wall's unit outward normal. This is `−(outward · forward)`: forward
 * points into the scene, so an outward normal turned back toward the camera
 * (opposing forward) yields a positive facing.
 *
 * Depends ONLY on the camera's orientation — NOT its distance (zoom/dolly moves
 * along the look direction, leaving it unchanged) nor a pan (translating
 * camera+target leaves the look direction unchanged). Only orbiting rotates the
 * camera, so only orbiting changes the fade. A near-vertical (top-down) view has
 * no meaningful horizontal facing → returns −1 (every wall stays opaque; you read
 * the plan from above). Pure.
 */
export function facingToward(fwdX: number, fwdZ: number, outNx: number, outNz: number): number {
  const len = Math.hypot(fwdX, fwdZ)
  if (len < 0.15) return -1 // looking (nearly) straight down/up → keep walls solid
  return -(outNx * fwdX + outNz * fwdZ) / len
}

/**
 * Graded fade strength (0 = fully solid, 1 = peak fade) from a `toward`-camera
 * cosine (see `facingToward`): 0 at or below `onset`, ramping smoothly to 1 at
 * head-on (`toward` = 1). A plain smoothstep — gentle at both ends, monotonic —
 * so a near wall settles honestly at whatever translucency its facing angle
 * warrants (the intended graded look). NOT biased toward a fast ramp: the far-wall
 * "washed pane" the old binary target guarded against is prevented structurally
 * (a far wall has `toward` ≤ 0 → strength 0), not by snapping near walls to an
 * endpoint.
 */
export function revealStrength(toward: number, onset = REVEAL_ONSET, full = REVEAL_FULL): number {
  return smoothstep(onset, full, toward)
}

/**
 * Convenience: graded fade strength straight from the camera forward (XZ) + a
 * wall's outward normal (`facingToward` → `revealStrength`).
 */
export function wallRevealStrength(
  fwdX: number,
  fwdZ: number,
  outNx: number,
  outNz: number,
): number {
  return revealStrength(facingToward(fwdX, fwdZ, outNx, outNz))
}

/**
 * Corner-SPREAD fade strength (WALL-REVEAL-CORNER-SPREAD) for a wall whose
 * corner neighbour is fading by its OWN facing. Three smooth factors:
 *  - this wall's own facing, graded on the spread curve — onset `SPREAD_ONSET`
 *    ("faces the camera at least slightly"), full by `SPREAD_FULL` (a corner
 *    companion is near-perpendicular to the head-on wall, so its `toward` tops
 *    out well below 1 — see `SPREAD_FULL`);
 *  - CAPPED at the strongest corner-neighbour's OWN strength: the follower never
 *    fades deeper than its leader. Without the cap, a ~45° two-facade view (both
 *    walls fading by their own facing) would have each wall's spread (full by
 *    `SPREAD_FULL`) override its own graded strength and snap both near peak —
 *    exactly the graded look this rework exists to provide;
 *  - ramped over `SPREAD_GATE`→`SPREAD_GATE_FULL` on the neighbour's strength so
 *    the spread engages smoothly instead of popping when a neighbour crosses the
 *    gate mid-orbit (there is deliberately no hysteresis any more).
 * The caller takes `max(own, spread)`. Pass only neighbours' OWN-facing strengths
 * (never their final, spread-inclusive strengths) — that is what keeps spread
 * first-degree, with no cascade around the perimeter.
 */
export function cornerSpreadStrength(toward: number, maxNeighborOwnStrength: number): number {
  return (
    Math.min(smoothstep(SPREAD_ONSET, SPREAD_FULL, toward), maxNeighborOwnStrength) *
    smoothstep(SPREAD_GATE, SPREAD_GATE_FULL, maxNeighborOwnStrength)
  )
}

/**
 * Target opacity for a given fade `strength`: interpolates from fully opaque
 * (1, at strength 0) down to `floorOpacity` (at strength 1) — `WALL_TRANSLUCENT_MIN`
 * in translucent mode, 0 in auto-hide. A near wall settles anywhere on this line
 * per its facing angle.
 */
export function revealTargetOpacity(strength: number, floorOpacity: number): number {
  return 1 - strength * (1 - floorOpacity)
}

/** A wall's id + endpoints, the minimum `cornerNeighbors` needs. */
export interface WallEndpoints {
  id: string
  start: readonly [number, number]
  end: readonly [number, number]
}

/**
 * Map each wall id → the ids of walls that share a CORNER with it (an endpoint of
 * one within `eps` metres of an endpoint of the other). First-degree neighbours
 * only; never includes the wall itself. Precomputable once per plan (the wall list
 * is static). Drives the corner-spread rule: a wall adjacent to an actively-fading
 * wall may fade too.
 */
export function cornerNeighbors(
  walls: readonly WallEndpoints[],
  eps = 0.05,
): Map<string, string[]> {
  const near = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps
  const shares = (a: WallEndpoints, b: WallEndpoints) =>
    near(a.start, b.start) || near(a.start, b.end) || near(a.end, b.start) || near(a.end, b.end)
  const map = new Map<string, string[]>()
  for (const w of walls) if (!map.has(w.id)) map.set(w.id, [])
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]
      const b = walls[j]
      if (a.id === b.id) continue // never self-match (duplicate ids)
      if (shares(a, b)) {
        map.get(a.id)?.push(b.id)
        map.get(b.id)?.push(a.id)
      }
    }
  }
  return map
}

/** A rectangle (+ optional L-shaped extension) in plan metres — the shape both
 *  the fixed-apartment `RoomDef` and the custom-plan `PlanRoom` reduce to for a
 *  point-in-room test. */
/** One axis-aligned piece of a room's footprint. A room contributes as MANY of
 *  these as it has parts — the list handed to {@link pointInRooms} is flat, so a
 *  room built from three rectangles is simply three entries. */
export interface RoomRect {
  x: number
  z: number
  w: number
  d: number
}

/** True if `(x, z)` lies inside any room rectangle. A small `pad` lets a probe
 *  just inside a wall still register as interior. */
export function pointInRooms(x: number, z: number, rooms: readonly RoomRect[], pad = 0): boolean {
  for (const r of rooms) {
    if (x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad)
      return true
  }
  return false
}

/**
 * Floor of the faded-wall emissive lift at full night (ORBIT-NIGHT-CAPS).
 *
 * The REVEAL-THROUGH-TINT lift is a CONSTANT `(1 − opacity) × 0.7` toward `#eceae4`, chosen so a
 * faded wall does not cast a murky veil over the rooms seen through it. By day that is right — the
 * pane sits against a daylit room and reads as glass. At 20:00 in orbit the same ~0.44 emissive on
 * a near-black wall body is the brightest thing in the frame: a glowing pane, and a second
 * contributor (after the baked-GI patch on the section-cut faces) to the bright wall tops.
 * Scaling it by the scene's daylight keeps the day look byte-identical and leaves just enough lift
 * at night for the wall to stay a readable outline rather than a black slab.
 */
export const NIGHT_LIFT_MIN = 0.25

/**
 * Scale for the faded-wall emissive lift from the scene's `daylight`
 * (`scene/lighting/altitudeCurve.ts:daylightFromAltitude` — 1 for any sun at or above the horizon,
 * ramping to 0 by 8° below it). `1` by day, {@link NIGHT_LIFT_MIN} at full night, monotonic in
 * between. Pure, and clamped so an out-of-range input cannot brighten the lift past its daytime
 * value. Shared by `WallSegment` (default flat) and `PlanShell` (custom plans) so the two
 * renderers cannot drift.
 */
export function revealLiftScale(daylight: number): number {
  const d = Math.min(1, Math.max(0, daylight))
  return NIGHT_LIFT_MIN + (1 - NIGHT_LIFT_MIN) * d
}

/**
 * Base `renderOrder` for a FADED wall surface (WALL-REVEAL-SINGLE-LAYER).
 *
 * Every faded wall mesh must sort BEFORE any ordinary transparent object (which sits at
 * `renderOrder` 0) so that a pane/curtain IN FRONT of a faded wall still blends over it, and a
 * pane BEHIND one simply depth-fails. A large negative base leaves ~1000 m of scene depth
 * (at centimetre resolution) below zero, which no residential plan comes near.
 */
export const REVEAL_ORDER_BASE = -100000

/** `renderOrder` an OPAQUE (non-fading) wall carries — three's default. */
export const REVEAL_ORDER_OPAQUE = 0

/**
 * `renderOrder` for one faded wall's meshes from its view-space `depth` (metres along the camera
 * forward to the wall midpoint) — WALL-REVEAL-SINGLE-LAYER.
 *
 * Three sorts the transparent list by `groupOrder`, then `renderOrder` ASCENDING, and only then
 * back-to-front by z. With `depthWrite` left on through the fade (WALL-FADE-DEPTHWRITE), that
 * default back-to-front order makes two faded walls stacked in depth composite TWICE — the rear
 * one blends, then the nearer one blends over it, so the overlap reads
 * `1 − (1 − 0.37)² ≈ 0.60` against `0.37` beside it: the rectangular density bands and L-shaped
 * dark patches at corners, at the kitchen/yard walls and in the room editor.
 *
 * Ordering faded walls FRONT-TO-BACK instead makes the nearest faded fragment write depth first
 * and every faded fragment behind it fail the depth test: exactly ONE layer of alpha per pixel,
 * whatever is stacked. So `renderOrder` INCREASES with depth (nearer = lower = drawn first =
 * more negative), which is the opposite sign to the intuitive `-depth` form — `-depth` would
 * merely re-state three's own back-to-front order and keep the banding.
 *
 * Monotonic non-decreasing in `depth`, quantised to centimetres (a stable integer, so two walls
 * at the same depth keep a deterministic order instead of flickering), clamped to stay strictly
 * negative. Returns {@link REVEAL_ORDER_OPAQUE} when the wall is not fading, so a wall that
 * returns to opaque resets to three's default order. Non-finite / behind-camera depths clamp to
 * the nearest bucket. Pure.
 */
export function revealRenderOrder(depth: number, faded = true): number {
  if (!faded) return REVEAL_ORDER_OPAQUE
  const d = Number.isFinite(depth) ? Math.max(0, depth) : 0
  return Math.min(-1, REVEAL_ORDER_BASE + Math.round(Math.min(d, 999) * 100))
}

/**
 * Opacity at/below which a fading wall switches to the BLENDED path — the
 * `transparent` flag, `depthWrite: false` + `EqualDepth` (WALL-REVEAL-DEPTH-PREPASS)
 * and the front-to-back `renderOrder` (WALL-REVEAL-SINGLE-LAYER).
 *
 * Named so the two wall-reveal fade loops (`WallSegment`, `useWallReveal`) cannot
 * drift apart on it. Deliberately close to 1:
 * the flag must flip only at the very END of the fade, never mid-band, so the
 * blend path is entered while the wall is still visually opaque.
 */
export const REVEAL_TRANSPARENT_AT = 0.985

/**
 * Enter/exit thresholds of the reveal's OPAQUE ↔ FADING state machine (WALL-REVEAL-HYSTERESIS).
 *
 * {@link REVEAL_TRANSPARENT_AT} is a SINGLE threshold, and everything that hangs off it flips
 * hard: `transparent`, the `depthWrite: false` + `EqualDepth` pre-pass path
 * (WALL-REVEAL-DEPTH-PREPASS), the front-to-back `renderOrder` (WALL-REVEAL-SINGLE-LAYER), the
 * emissive through-tint lift, and — the loud one — `visible = false` on every wall OVERLAY
 * (WALL-FADE-OVERLAY-CULL: the mapped face plane, the crown, the skirting, the ORBIT-CLEAN-CUT
 * section cap). So a wall whose eased opacity RESTS at the threshold swaps its whole surface
 * treatment on and off once per frame while the camera barely moves.
 *
 * That is reachable because the own-facing curve is a smoothstep from `REVEAL_ONSET`: at the
 * default fade strength the threshold `0.985` is crossed at `toward ≈ 0.285`, only 0.035 past
 * the onset, where the curve is shallow — a camera dithering ±0.5° about that azimuth parks the
 * target inside a ±0.01 band around 0.985 and the flip becomes a strobe.
 *
 * `revealPhase` replaces the bare comparison with a two-threshold latch: a wall enters FADING
 * only below `REVEAL_FADE_ENTER` and returns to OPAQUE only above `REVEAL_FADE_EXIT`, i.e. the
 * eased value must travel **0.02 past 0.985 in the new direction** before anything flips. The
 * band is deliberately the same order as the largest per-frame opacity step the ease can take
 * near the threshold, so one flip costs at most one extra frame of settle and the dither costs
 * none at all.
 *
 * Note this is NOT the retired WALL-REVEAL-BINARY-TARGET hysteresis: that one snapped the
 * TARGET OPACITY to an endpoint (and is still retired — the opacity stays graded and
 * continuous). This latches only the discrete RENDER STATE derived from it.
 */
export const REVEAL_FADE_ENTER = 0.975
export const REVEAL_FADE_EXIT = 0.995

/** The two states of a wall's reveal render path — see {@link revealPhase}. */
export type RevealPhase = 'opaque' | 'fading'

/**
 * Next reveal phase from the previous one and this frame's EASED opacity
 * (WALL-REVEAL-HYSTERESIS). A pure Schmitt trigger: opaque → fading below
 * {@link REVEAL_FADE_ENTER}, fading → opaque above {@link REVEAL_FADE_EXIT}, and no change in
 * between. Deterministic in the input sequence, so every consumer that starts at `'opaque'` and
 * is fed the same published opacities agrees on the phase without a shared signal.
 */
export function revealPhase(prev: RevealPhase, eased: number): RevealPhase {
  if (prev === 'opaque') return eased < REVEAL_FADE_ENTER ? 'fading' : 'opaque'
  return eased > REVEAL_FADE_EXIT ? 'opaque' : 'fading'
}

/**
 * Time constant (seconds) of the reveal's temporal ease — WALL-REVEAL-EASE.
 *
 * The fade used a fixed `cur += (target − cur) × 0.18` PER FRAME, which is
 * frame-rate DEPENDENT: ~84 ms at 60 fps, ~170 ms at 30 fps, and unbounded on a
 * demand-mode canvas that renders a handful of frames during a flick. Two nearly
 * identical orbit angles could therefore land on opposite sides of
 * {@link REVEAL_TRANSPARENT_AT} purely because of how many frames happened to
 * render — which is what made the flip look arbitrary and piecemeal. 200 ms reads
 * as a deliberate settle without lagging a drag.
 */
export const REVEAL_TAU = 0.2

/** Largest `delta` (seconds) the ease will honour, so one long stall (tab
 *  restore, a shader compile) eases rather than teleports. */
const REVEAL_MAX_DELTA = 0.1

/** Below this the ease snaps onto the target, so a wall lands EXACTLY on its
 *  graded target instead of parking asymptotically short. */
export const REVEAL_SNAP = 0.005

/**
 * One frame of the reveal's frame-rate-INDEPENDENT ease (WALL-REVEAL-EASE): an
 * exponential approach to `target` with time constant `tau` seconds, so the
 * elapsed TIME — not the frame count — decides how far the opacity moved.
 * `1 − e^(−dt/τ)` is the exact discrete form of `dx/dt = (target − x)/τ`, so any
 * split of the same interval into frames gives the same result.
 *
 * Snaps within {@link REVEAL_SNAP}; clamps `delta` to {@link REVEAL_MAX_DELTA};
 * a non-finite or non-positive `delta` leaves the value untouched. Pure.
 */
export function easeRevealOpacity(
  current: number,
  target: number,
  delta: number,
  tau = REVEAL_TAU,
): number {
  if (Math.abs(target - current) <= REVEAL_SNAP) return target
  if (!Number.isFinite(delta) || delta <= 0) return current
  const dt = Math.min(delta, REVEAL_MAX_DELTA)
  const next = current + (target - current) * (1 - Math.exp(-dt / Math.max(1e-4, tau)))
  return Math.abs(next - target) <= REVEAL_SNAP ? target : next
}

/**
 * Group walls into RUNS: maximal sets of COLLINEAR segments that touch end-to-end
 * (WALL-REVEAL-RUN-SHARED). The curated flat splits one physical wall into several
 * `WallDef`s (`wall-ext-E-col1` / `-col2` / `-mid`, `wall-int-b3-LD` / `-col`) so
 * openings, columns and thickness changes can be modelled — but to the eye they are
 * ONE wall and must fade as one.
 *
 * Returns wall id → a stable run key (the lexicographically smallest member id).
 * Two walls join a run when their directions are parallel within `angleEps` (on the
 * undirected line), their offsets from the shared line agree within `eps`, and their
 * projections onto it touch or overlap within `eps`. Pure and precomputable once per
 * plan.
 */
export function wallRuns(
  walls: readonly WallEndpoints[],
  eps = 0.05,
  angleEps = 1e-3,
): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) !== r) r = parent.get(r) as string
    return r
  }
  for (const w of walls) if (!parent.has(w.id)) parent.set(w.id, w.id)
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    // Keep the lexicographically smaller id as the root so the key is stable.
    if (ra < rb) parent.set(rb, ra)
    else parent.set(ra, rb)
  }
  const dirOf = (w: WallEndpoints) => {
    const dx = w.end[0] - w.start[0]
    const dz = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dz) || 1
    return { ux: dx / len, uz: dz / len }
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]
      const b = walls[j]
      if (a.id === b.id) continue
      const da = dirOf(a)
      const db = dirOf(b)
      // Parallel on the UNDIRECTED line (a run may be authored in either direction).
      if (Math.abs(da.ux * db.uz - da.uz * db.ux) > angleEps) continue
      // Same infinite line: b's start must lie on a's line (perpendicular distance).
      const px = b.start[0] - a.start[0]
      const pz = b.start[1] - a.start[1]
      if (Math.abs(px * da.uz - pz * da.ux) > eps) continue
      // Touching / overlapping along the line.
      const proj = (x: number, z: number) => (x - a.start[0]) * da.ux + (z - a.start[1]) * da.uz
      const a0 = 0
      const a1 = proj(a.end[0], a.end[1])
      const b0 = proj(b.start[0], b.start[1])
      const b1 = proj(b.end[0], b.end[1])
      const [aLo, aHi] = a0 <= a1 ? [a0, a1] : [a1, a0]
      const [bLo, bHi] = b0 <= b1 ? [b0, b1] : [b1, b0]
      if (bLo > aHi + eps || aLo > bHi + eps) continue
      union(a.id, b.id)
    }
  }
  const out = new Map<string, string>()
  for (const w of walls) out.set(w.id, find(w.id))
  return out
}

/**
 * Corner adjacency SHARED ACROSS EACH RUN (WALL-REVEAL-RUN-SHARED): wall id → the
 * ids of every wall that shares a corner with ANY member of that wall's run,
 * excluding the run's own members.
 *
 * Collinear members of one run already share an outward normal, so their OWN
 * facing strength is identical — the only thing that made two halves of one
 * physical wall settle at different opacities (measured 0.147 vs 0.396 on
 * `wall-int-b3-LD` / `-col`, 0.948 vs 0.832 on `wall-ext-E-col1` / `-col2`) was
 * corner SPREAD, which each segment computed from its OWN corner neighbours. With
 * the union, every member of a run sees the same neighbour set and therefore the
 * same strength — so a run crosses {@link REVEAL_TRANSPARENT_AT} as one wall
 * instead of piecemeal. Drop-in replacement for {@link cornerNeighbors}. Pure.
 */
export function runCornerNeighbors(
  walls: readonly WallEndpoints[],
  eps = 0.05,
): Map<string, string[]> {
  const corners = cornerNeighbors(walls, eps)
  const runs = wallRuns(walls, eps)
  const byRun = new Map<string, Set<string>>()
  for (const w of walls) {
    const key = runs.get(w.id) as string
    let set = byRun.get(key)
    if (!set) {
      set = new Set<string>()
      byRun.set(key, set)
    }
    for (const n of corners.get(w.id) ?? []) set.add(n)
  }
  const out = new Map<string, string[]>()
  for (const w of walls) {
    const key = runs.get(w.id) as string
    const set = byRun.get(key) as Set<string>
    out.set(
      w.id,
      [...set].filter((id) => runs.get(id) !== key),
    )
  }
  return out
}
