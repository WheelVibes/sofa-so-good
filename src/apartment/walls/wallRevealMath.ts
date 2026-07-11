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
export function revealStrength(toward: number, onset = REVEAL_ONSET): number {
  return smoothstep(onset, 1, toward)
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
export interface RoomRect {
  x: number
  z: number
  w: number
  d: number
  ext?: { x: number; z: number; w: number; d: number }
}

/** True if `(x, z)` lies inside any room rectangle (or its L-extension). A small
 *  `pad` lets a probe just inside a wall still register as interior. */
export function pointInRooms(x: number, z: number, rooms: readonly RoomRect[], pad = 0): boolean {
  for (const r of rooms) {
    if (x >= r.x - pad && x <= r.x + r.w + pad && z >= r.z - pad && z <= r.z + r.d + pad)
      return true
    const e = r.ext
    if (e && x >= e.x - pad && x <= e.x + e.w + pad && z >= e.z - pad && z <= e.z + e.d + pad)
      return true
  }
  return false
}
